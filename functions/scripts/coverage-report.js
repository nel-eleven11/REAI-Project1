#!/usr/bin/env node
// Generates the data section of docs/auditoria-cobertura.md from real Firestore
// content, so the audit's numbers are reproducible instead of hand-copied.
//
//   Emulator:   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/coverage-report.js --project demo-test
//   Production: GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/coverage-report.js --project <id>
//
// Writes to docs/auditoria-cobertura-datos.md unless --stdout is passed.
// Reads only; the one write is coverage_stats, recomputed via the same code
// path the scheduled function and the UI heatmap use, so all three agree.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const { SPECIALTIES, ZONES } = require("../lib/config/keywordStrategy");
const { computeCoverageStats } = require("../lib/services/coverageStatsService");

function parseArgs(argv) {
  const args = { project: process.env.GCLOUD_PROJECT, stdout: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--project") args.project = argv[i + 1];
    if (argv[i] === "--stdout") args.stdout = true;
  }
  return args;
}

function pct(part, whole) {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

function money(value) {
  return `$${value.toFixed(2)}`;
}

async function collectCostTelemetry(db) {
  const snapshot = await db.collection("collection_runs").get();
  const totals = {
    runs: 0,
    apiCalls: 0,
    costUsd: 0,
    resultsNew: 0,
    resultsDuplicated: 0,
    firstRun: null,
    lastRun: null,
  };

  for (const doc of snapshot.docs) {
    const run = doc.data();
    totals.runs += 1;
    totals.apiCalls += run.api_calls ?? 0;
    totals.costUsd += run.estimated_cost_usd ?? 0;
    totals.resultsNew += run.results_new ?? 0;
    totals.resultsDuplicated += run.results_duplicated ?? 0;
    if (run.timestamp) {
      if (!totals.firstRun || run.timestamp < totals.firstRun) totals.firstRun = run.timestamp;
      if (!totals.lastRun || run.timestamp > totals.lastRun) totals.lastRun = run.timestamp;
    }
  }

  return totals;
}

// Purged docs keep only place_id, so absence of `zona` marks them; they are
// past the 30-day window and must not count as coverage.
async function collectRecordTelemetry(db) {
  const snapshot = await db.collection("medicos").get();
  const totals = { stored: 0, live: 0, suppressed: 0, purged: 0, withPhone: 0, withWebsite: 0, normalized: 0 };

  for (const doc of snapshot.docs) {
    const doctor = doc.data();
    totals.stored += 1;
    if (!doctor.zona) {
      totals.purged += 1;
      continue;
    }
    if (doctor.suppressed) {
      totals.suppressed += 1;
      continue;
    }
    totals.live += 1;
    if (doctor.telefono) totals.withPhone += 1;
    if (doctor.sitio_web) totals.withWebsite += 1;
    if (doctor.especialidad_normalizada) totals.normalized += 1;
  }

  return totals;
}

function zoneNumber(zone) {
  const parsed = Number(String(zone).replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildMatrix(stats) {
  const byKey = new Map(stats.map((s) => [`${s.zona}__${s.especialidad}`, s]));
  const lines = [];

  lines.push(`| Zona | ${SPECIALTIES.map((s) => s.slice(0, 6) + ".").join(" | ")} | **Total** |`);
  lines.push(`|---|${SPECIALTIES.map(() => "---:").join("|")}|---:|`);

  const zoneTotals = [];
  for (const zone of ZONES) {
    const cells = SPECIALTIES.map((specialty) => {
      const stat = byKey.get(`${zone}__${specialty}`);
      if (!stat || stat.searches_run === 0) return "—";
      return String(stat.unique_results);
    });
    const total = SPECIALTIES.reduce((sum, specialty) => {
      const stat = byKey.get(`${zone}__${specialty}`);
      return sum + (stat?.unique_results ?? 0);
    }, 0);
    zoneTotals.push({ zone, total });
    lines.push(`| ${zone} | ${cells.join(" | ")} | **${total}** |`);
  }

  return { table: lines.join("\n"), zoneTotals };
}

function buildZoneQuality(stats) {
  const byZone = new Map();
  for (const stat of stats) {
    if (!byZone.has(stat.zona)) {
      byZone.set(stat.zona, { searches: 0, results: 0, phone: 0, website: 0, emptyCells: 0, searchedCells: 0 });
    }
    const bucket = byZone.get(stat.zona);
    bucket.searches += stat.searches_run;
    bucket.results += stat.unique_results;
    // pct_* are percentages of that cell's results; convert back to counts.
    bucket.phone += Math.round((stat.pct_con_telefono / 100) * stat.unique_results);
    bucket.website += Math.round((stat.pct_con_sitio_web / 100) * stat.unique_results);
    if (stat.searches_run > 0) {
      bucket.searchedCells += 1;
      if (stat.unique_results === 0) bucket.emptyCells += 1;
    }
  }

  const rows = [...byZone.entries()]
    .sort((a, b) => zoneNumber(a[0]) - zoneNumber(b[0]))
    .map(([zone, b]) => ({
      zone,
      ...b,
      pctPhone: pct(b.phone, b.results),
      pctWebsite: pct(b.website, b.results),
      yield: b.searches > 0 ? Number((b.results / b.searches).toFixed(2)) : 0,
    }));

  const table = [
    "| Zona | Búsquedas | Resultados | Rendimiento (res./búsq.) | % teléfono | % sitio web | Celdas vacías |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...rows.map(
      (r) =>
        `| ${r.zone} | ${r.searches} | ${r.results} | ${r.yield} | ${r.pctPhone}% | ${r.pctWebsite}% | ${r.emptyCells}/${r.searchedCells} |`
    ),
  ].join("\n");

  return { table, rows };
}

function buildFindings(rows, records) {
  const searched = rows.filter((r) => r.searches > 0);
  if (searched.length === 0) return "_Sin búsquedas registradas: no hay hallazgo que reportar._";

  const ranked = [...searched].sort((a, b) => b.yield - a.yield);
  const totalEmpty = searched.reduce((s, r) => s + r.emptyCells, 0);
  const totalSearchedCells = searched.reduce((s, r) => s + r.searchedCells, 0);

  // A top-3 vs bottom-3 gap is only meaningful once the two groups are
  // disjoint; below that, report the ranking and let the reader judge.
  const GROUP = 3;
  const lines = [];
  if (searched.length >= GROUP * 2) {
    const top = ranked.slice(0, GROUP);
    const bottom = ranked.slice(-GROUP).reverse();
    const topAvg = top.reduce((s, r) => s + r.yield, 0) / GROUP;
    const bottomAvg = bottom.reduce((s, r) => s + r.yield, 0) / GROUP;
    const ratio = bottomAvg > 0 ? `${(topAvg / bottomAvg).toFixed(1)}×` : "un factor no acotado (el grupo inferior rinde 0)";
    lines.push(
      `- **Zonas con mayor rendimiento:** ${top.map((r) => `${r.zone} (${r.yield})`).join(", ")}.`,
      `- **Zonas con menor rendimiento:** ${bottom.map((r) => `${r.zone} (${r.yield})`).join(", ")}.`,
      `- **Brecha:** las tres zonas más productivas rinden **${ratio}** más resultados por búsqueda que las tres menos productivas, con el mismo número de búsquedas ejecutadas en cada una.`
    );
  } else {
    lines.push(
      `- **Zonas buscadas hasta ahora (${searched.length}):** ${ranked.map((r) => `${r.zone} (${r.yield})`).join(", ")}.`,
      `- _Muestra insuficiente para contrastar grupos: se requieren al menos ${GROUP * 2} zonas buscadas para reportar una brecha._`
    );
  }

  return [
    ...lines,
    `- **Celdas buscadas sin ningún resultado:** ${totalEmpty} de ${totalSearchedCells} (${pct(totalEmpty, totalSearchedCells)}%).`,
    `- **Completitud del contacto:** ${pct(records.withPhone, records.live)}% de los registros vigentes tiene teléfono y ${pct(records.withWebsite, records.live)}% tiene sitio web.`,
    `- **Evidencia de especialidad:** ${pct(records.normalized, records.live)}% de los registros vigentes declara su especialidad en el nombre; el resto usa el fallback de la especialidad buscada.`,
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error("Missing project id. Pass --project <id> or set GCLOUD_PROJECT.");
    process.exit(1);
  }

  admin.initializeApp({ projectId: args.project });
  const db = admin.firestore();

  const stats = await computeCoverageStats();
  const cost = await collectCostTelemetry(db);
  const records = await collectRecordTelemetry(db);

  const { table: matrix } = buildMatrix(stats);
  const { table: quality, rows } = buildZoneQuality(stats);

  const uniqueLive = records.live;
  const costPerRecord = uniqueLive > 0 ? cost.costUsd / uniqueLive : 0;
  const dupRate = pct(cost.resultsDuplicated, cost.resultsNew + cost.resultsDuplicated);
  const generatedAt = new Date().toISOString();

  const report = `<!-- GENERADO por functions/scripts/coverage-report.js — no editar a mano. -->

# Auditoría de cobertura — datos

**Proyecto:** \`${args.project}\` · **Generado:** ${generatedAt}
**Ventana de recolección:** ${cost.firstRun ?? "—"} → ${cost.lastRun ?? "—"}

## Resumen

| Métrica | Valor |
|---|---:|
| Combinaciones ejecutadas (de 576) | ${cost.runs} |
| Llamadas a Places API | ${cost.apiCalls} |
| Costo estimado total | ${money(cost.costUsd)} |
| Registros almacenados | ${records.stored} |
| — vigentes | ${records.live} |
| — con remoción solicitada | ${records.suppressed} |
| — purgados (ventana de 30 días) | ${records.purged} |
| **Costo por registro vigente** | ${money(costPerRecord)} |
| Tasa de duplicados | ${dupRate}% |
| Registros con teléfono | ${records.withPhone} (${pct(records.withPhone, records.live)}%) |
| Registros con sitio web | ${records.withWebsite} (${pct(records.withWebsite, records.live)}%) |
| Especialidad evidenciada en el nombre | ${records.normalized} (${pct(records.normalized, records.live)}%) |

## Resultados únicos por zona × especialidad

\`—\` significa que la celda **no se ha buscado todavía**. Un \`0\` significa que se buscó y
Google no devolvió nada: es un dato, no un vacío.

${matrix}

## Calidad y rendimiento por zona

${quality}

## Hallazgos cuantitativos

${buildFindings(rows, records)}
`;

  if (args.stdout) {
    process.stdout.write(report);
  } else {
    const outPath = path.join(__dirname, "..", "..", "docs", "auditoria-cobertura-datos.md");
    fs.writeFileSync(outPath, report);
    console.log(`Wrote ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
