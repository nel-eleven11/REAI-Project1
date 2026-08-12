
export interface Doctor {
  nombre: string;
  // What the place actually looks like: the normalized specialty when the name
  // reveals one, otherwise the specialty we searched for. This is the field
  // /directorio filters on — especialidad_raw stays for traceability.
  especialidad: string;
  especialidad_raw: string;
  especialidad_normalizada: string | null;
  confidence: number | null;
  direccion: string;
  telefono: string | null;
  sitio_web: string | null;
  missing_fields: string[];
  // Zone extracted from direccion when found, otherwise the searched zone —
  // /directorio filters on this. zona_raw is the searched zone, kept for
  // traceability.
  zona: string;
  zona_raw: string;
  zona_normalizada: string | null;
  lat: number | null;
  lng: number | null;
  fecha_recoleccion: string;
  expires_at: string;
  run_id: string;
  place_id: string;
  keyword_usado: string;
  suppressed: boolean;
}

export interface CollectionRun {
  keyword: string;
  zona: string;
  especialidad: string;
  timestamp: string;
  api_calls: number;
  results_new: number;
  results_duplicated: number;
  estimated_cost_usd: number;
}

export interface CoverageStats {
  zona: string;
  especialidad: string;
  searches_run: number;
  unique_results: number;
  pct_con_telefono: number;
  pct_con_sitio_web: number;
  computed_at: string;
}

export type CorrectionType = "correccion" | "remocion";
export type CorrectionStatus = "pendiente" | "aplicada" | "rechazada";

export interface Correction {
  place_id: string;
  tipo: CorrectionType;
  mensaje: string;
  estado: CorrectionStatus;
  created_at: string;
  ip: string;
}
