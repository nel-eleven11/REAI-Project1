export interface Medico {
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
