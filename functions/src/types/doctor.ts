
export interface Doctor {
  nombre: string;
  especialidad_raw: string;
  direccion: string;
  telefono: string | null;
  sitio_web: string | null;
  missing_fields: string[];
  zona: string;
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
