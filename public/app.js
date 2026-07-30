

const config = window.APP_CONFIG || {};
const API_BASE = config.apiBaseUrl || "";

const ESPECIALIDADES = [
  "cardiología",
  "pediatría",
  "dermatología",
  "ginecología",
  "ortopedia",
  "oftalmología",
  "traumatología",
  "psiquiatría",
];
const ZONAS = Array.from({ length: 18 }, (_, i) => `zona ${i + 1}`);

let currentPage = 1;
let currentPageSize = 20;
let appCheckToken = null;

async function initAppCheck() {
  const siteKey = config.appCheckSiteKey;
  if (!siteKey || siteKey.startsWith("REPLACE_ME") || !config.firebase) {
    console.warn("App Check not configured (placeholder site key) — requests will not include an App Check token.");
    return;
  }

  try {
    const [{ initializeApp }, { initializeAppCheck, ReCaptchaV3Provider, getToken }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js"),
    ]);

    const app = initializeApp(config.firebase);
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });

    const result = await getToken(appCheck, false);
    appCheckToken = result.token;
  } catch (error) {
    console.warn("App Check initialization failed, continuing without a token:", error);
  }
}

function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (appCheckToken) {
    headers["X-Firebase-AppCheck"] = appCheckToken;
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// ---------------------------------------------------------------------
// Filters setup
// ---------------------------------------------------------------------
function populateFilters() {
  const especialidadSelect = document.getElementById("filter-especialidad");
  for (const especialidad of ESPECIALIDADES) {
    const option = document.createElement("option");
    option.value = especialidad;
    option.textContent = especialidad;
    especialidadSelect.appendChild(option);
  }

  const zonaSelect = document.getElementById("filter-zona");
  for (const zona of ZONAS) {
    const option = document.createElement("option");
    option.value = zona;
    option.textContent = zona;
    zonaSelect.appendChild(option);
  }
}

// ---------------------------------------------------------------------
// Data age badge — plan.md section 13 "Frescura": fecha_recoleccion must
// be visible with its age in days on every record shown.
// ---------------------------------------------------------------------
function ageBadge(fechaRecoleccionIso) {
  const days = Math.floor((Date.now() - new Date(fechaRecoleccionIso).getTime()) / (24 * 60 * 60 * 1000));
  let cls = "age-fresh";
  if (days > 20) cls = "age-stale";
  else if (days > 7) cls = "age-aging";

  const span = document.createElement("span");
  span.className = `age-badge ${cls}`;
  span.textContent = `${days} día${days === 1 ? "" : "s"}`;
  span.title = `Recolectado el ${new Date(fechaRecoleccionIso).toLocaleDateString()}`;
  return span;
}

function fieldOrMissing(value) {
  if (!value) {
    const span = document.createElement("span");
    span.className = "field-missing";
    span.textContent = "No reportado en la fuente";
    return span;
  }
  return document.createTextNode(value);
}

// ---------------------------------------------------------------------
// Directory search + table rendering
// ---------------------------------------------------------------------
async function search(page = 1) {
  const especialidad = document.getElementById("filter-especialidad").value;
  const zona = document.getElementById("filter-zona").value;
  const pageSize = document.getElementById("filter-pagesize").value;
  const statusEl = document.getElementById("search-status");
  const button = document.getElementById("search-button");

  currentPage = page;
  currentPageSize = Number(pageSize);

  const params = new URLSearchParams({ page: String(page), pageSize });
  if (especialidad) params.set("especialidad", especialidad);
  if (zona) params.set("zona", zona);

  // Client-side throttle: purely UX (avoid double-submits), NOT a security
  // control. Real rate limiting is enforced server-side (rateLimiter.ts /
  // IP whitelist) — see plan.md section 11.
  button.disabled = true;
  statusEl.textContent = "Buscando...";
  statusEl.classList.remove("error");

  try {
    const res = await apiFetch(`/directorio?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = await res.json();
    renderResults(body.results || []);
    updatePagination(body);
    statusEl.textContent = `${(body.results || []).length} resultado(s) en esta página.`;
  } catch (error) {
    statusEl.textContent = `Error al buscar: ${error.message}`;
    statusEl.classList.add("error");
    renderResults([]);
  } finally {
    setTimeout(() => {
      button.disabled = false;
    }, 400);
  }
}

function renderResults(results) {
  const tbody = document.getElementById("results-body");
  tbody.innerHTML = "";

  if (results.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7" class="empty-row">Sin resultados para estos filtros.</td>`;
    tbody.appendChild(row);
    return;
  }

  for (const doctor of results) {
    const row = document.createElement("tr");

    const nombreCell = document.createElement("td");
    nombreCell.textContent = doctor.nombre || "(sin nombre)";
    row.appendChild(nombreCell);

    const especialidadCell = document.createElement("td");
    especialidadCell.textContent = doctor.especialidad_raw || "";
    row.appendChild(especialidadCell);

    const direccionCell = document.createElement("td");
    direccionCell.appendChild(fieldOrMissing(doctor.direccion));
    row.appendChild(direccionCell);

    const telefonoCell = document.createElement("td");
    telefonoCell.appendChild(fieldOrMissing(doctor.telefono));
    row.appendChild(telefonoCell);

    const sitioCell = document.createElement("td");
    if (doctor.sitio_web) {
      const link = document.createElement("a");
      link.href = doctor.sitio_web;
      link.textContent = "Visitar";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      sitioCell.appendChild(link);
    } else {
      sitioCell.appendChild(fieldOrMissing(null));
    }
    row.appendChild(sitioCell);

    const ageCell = document.createElement("td");
    ageCell.appendChild(ageBadge(doctor.fecha_recoleccion));
    row.appendChild(ageCell);

    const actionCell = document.createElement("td");
    const correctButton = document.createElement("button");
    correctButton.textContent = "Corregir/remover";
    correctButton.type = "button";
    correctButton.addEventListener("click", () => prefillCorrectionForm(doctor.place_id));
    actionCell.appendChild(correctButton);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  }
}

function updatePagination(body) {
  document.getElementById("page-indicator").textContent = `Página ${body.page}`;
  document.getElementById("prev-page").disabled = body.page <= 1;
  document.getElementById("next-page").disabled = !body.hasMore;
}

function prefillCorrectionForm(placeId) {
  document.getElementById("correction-place-id").value = placeId;
  document.getElementById("corrections-panel").scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------------
// Coverage heatmap (plan.md section 7)
// ---------------------------------------------------------------------
function pctToColor(pct) {
  // Simple 5-step scale matching the legend in index.html.
  if (pct >= 87.5) return "#14468f";
  if (pct >= 62.5) return "#2f7fd6";
  if (pct >= 37.5) return "#7fbcf5";
  if (pct > 0) return "#cfe8ff";
  return "#f4f6f8";
}

async function loadCoverage() {
  const container = document.getElementById("heatmap-container");
  try {
    const res = await apiFetch("/coverage");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    renderHeatmap(body.results || []);
  } catch (error) {
    container.innerHTML = `<p class="status-line error">No se pudo cargar la cobertura: ${error.message}</p>`;
  }
}

function renderHeatmap(stats) {
  const container = document.getElementById("heatmap-container");
  container.innerHTML = "";

  if (stats.length === 0) {
    container.innerHTML = `<p class="status-line">Sin datos de cobertura todavía — corre computeCoverageStats.</p>`;
    return;
  }

  const byKey = new Map(stats.map((s) => [`${s.zona}__${s.especialidad}`, s]));

  const table = document.createElement("table");
  table.className = "heatmap-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = "<th>Zona \\ Especialidad</th>" + ESPECIALIDADES.map((e) => `<th>${e}</th>`).join("");
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const zona of ZONAS) {
    const row = document.createElement("tr");
    const rowLabel = document.createElement("td");
    rowLabel.className = "heatmap-row-label";
    rowLabel.textContent = zona;
    row.appendChild(rowLabel);

    for (const especialidad of ESPECIALIDADES) {
      const cell = document.createElement("td");
      const stat = byKey.get(`${zona}__${especialidad}`);
      if (!stat) {
        cell.className = "heatmap-empty";
        cell.textContent = "—";
        cell.style.background = pctToColor(0);
      } else {
        cell.className = "heatmap-cell";
        cell.textContent = `${stat.pct_con_telefono}%`;
        cell.title = `${stat.unique_results} registro(s) únicos, ${stat.searches_run} búsqueda(s)`;
        cell.style.background = pctToColor(stat.pct_con_telefono);
      }
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

// ---------------------------------------------------------------------
// Corrections form (plan.md section 12)
// ---------------------------------------------------------------------
async function submitCorrection(event) {
  event.preventDefault();
  const statusEl = document.getElementById("correction-status");
  const button = document.getElementById("correction-submit");

  const placeId = document.getElementById("correction-place-id").value.trim();
  const tipo = document.getElementById("correction-tipo").value;
  const mensaje = document.getElementById("correction-mensaje").value.trim();

  button.disabled = true;
  statusEl.classList.remove("error");
  statusEl.textContent = "Enviando...";

  try {
    const res = await apiFetch("/correcciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: placeId, tipo, mensaje }),
    });
    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    statusEl.textContent =
      body.estado === "aplicada"
        ? "Remoción aplicada de inmediato. Ya no aparecerá en el directorio."
        : "Solicitud registrada, pendiente de revisión.";
    document.getElementById("correction-form").reset();
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.classList.add("error");
  } finally {
    setTimeout(() => {
      button.disabled = false;
    }, 400);
  }
}

// ---------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------
function init() {
  populateFilters();

  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    search(1);
  });

  document.getElementById("prev-page").addEventListener("click", () => {
    if (currentPage > 1) search(currentPage - 1);
  });

  document.getElementById("next-page").addEventListener("click", () => {
    search(currentPage + 1);
  });

  document.getElementById("correction-form").addEventListener("submit", submitCorrection);

  initAppCheck().finally(() => {
    search(1);
    loadCoverage();
  });
}

init();
