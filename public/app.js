const config = window.APP_CONFIG || {};
const API_BASE = config.apiBaseUrl || "";

const SPECIALTIES = [
  "cardiología",
  "pediatría",
  "dermatología",
  "ginecología",
  "ortopedia",
  "oftalmología",
  "traumatología",
  "psiquiatría",
];
const ZONES = Array.from({ length: 18 }, (_, i) => `zona ${i + 1}`);

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

function populateFilters() {
  const specialtySelect = document.getElementById("filter-especialidad");
  for (const specialty of SPECIALTIES) {
    const option = document.createElement("option");
    option.value = specialty;
    option.textContent = specialty;
    specialtySelect.appendChild(option);
  }

  const zoneSelect = document.getElementById("filter-zona");
  for (const zone of ZONES) {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = zone;
    zoneSelect.appendChild(option);
  }
}

function ageBadge(collectedAtIso) {
  const days = Math.floor((Date.now() - new Date(collectedAtIso).getTime()) / (24 * 60 * 60 * 1000));
  let cls = "age-fresh";
  if (days > 20) cls = "age-stale";
  else if (days > 7) cls = "age-aging";

  const span = document.createElement("span");
  span.className = `age-badge ${cls}`;
  span.textContent = `${days} día${days === 1 ? "" : "s"}`;
  span.title = `Recolectado el ${new Date(collectedAtIso).toLocaleDateString()}`;
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

async function search(page = 1) {
  const specialty = document.getElementById("filter-especialidad").value;
  const zone = document.getElementById("filter-zona").value;
  const pageSize = document.getElementById("filter-pagesize").value;
  const statusEl = document.getElementById("search-status");
  const button = document.getElementById("search-button");

  currentPage = page;
  currentPageSize = Number(pageSize);

  const params = new URLSearchParams({ page: String(page), pageSize });
  if (specialty) params.set("especialidad", specialty);
  if (zone) params.set("zona", zone);

  // Cosmetic only, not a security control — real rate limiting is server-side.
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

    const nameCell = document.createElement("td");
    nameCell.textContent = doctor.nombre || "(sin nombre)";
    row.appendChild(nameCell);

    const specialtyCell = document.createElement("td");
    specialtyCell.textContent = doctor.especialidad_raw || "";
    row.appendChild(specialtyCell);

    const addressCell = document.createElement("td");
    addressCell.appendChild(fieldOrMissing(doctor.direccion));
    row.appendChild(addressCell);

    const phoneCell = document.createElement("td");
    phoneCell.appendChild(fieldOrMissing(doctor.telefono));
    row.appendChild(phoneCell);

    const websiteCell = document.createElement("td");
    if (doctor.sitio_web) {
      const link = document.createElement("a");
      link.href = doctor.sitio_web;
      link.textContent = "Visitar";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      websiteCell.appendChild(link);
    } else {
      websiteCell.appendChild(fieldOrMissing(null));
    }
    row.appendChild(websiteCell);

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

function pctToColor(pct) {
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
  headRow.innerHTML = "<th>Zona \\ Especialidad</th>" + SPECIALTIES.map((s) => `<th>${s}</th>`).join("");
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const zone of ZONES) {
    const row = document.createElement("tr");
    const rowLabel = document.createElement("td");
    rowLabel.className = "heatmap-row-label";
    rowLabel.textContent = zone;
    row.appendChild(rowLabel);

    for (const specialty of SPECIALTIES) {
      const cell = document.createElement("td");
      const stat = byKey.get(`${zone}__${specialty}`);
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

async function submitCorrection(event) {
  event.preventDefault();
  const statusEl = document.getElementById("correction-status");
  const button = document.getElementById("correction-submit");

  const placeId = document.getElementById("correction-place-id").value.trim();
  const correctionType = document.getElementById("correction-tipo").value;
  const message = document.getElementById("correction-mensaje").value.trim();

  button.disabled = true;
  statusEl.classList.remove("error");
  statusEl.textContent = "Enviando...";

  try {
    const res = await apiFetch("/correcciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: placeId, tipo: correctionType, mensaje: message }),
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
