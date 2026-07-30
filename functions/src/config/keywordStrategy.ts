export const ESPECIALIDADES = [
  "cardiología",
  "pediatría",
  "dermatología",
  "ginecología",
  "ortopedia",
  "oftalmología",
  "traumatología",
  "psiquiatría",
] as const;

export type Especialidad = (typeof ESPECIALIDADES)[number];

export const ZONAS = Array.from({ length: 18 }, (_, i) => `zona ${i + 1}`);

export const SUFIJOS_BUSQUEDA = ["médico", "doctor", "clínica", "consultorio"] as const;

export type Sufijo = (typeof SUFIJOS_BUSQUEDA)[number];

export interface KeywordCombo {
  keyword: string;
  especialidad: Especialidad;
  zona: string;
}

export function buildKeyword(especialidad: Especialidad, sufijo: Sufijo, zona: string): string {
  return `${sufijo} ${especialidad} ${zona} Guatemala`;
}

// Balanced coverage: same number of combinations per zone, so we don't
// contaminate the bias audit with uneven searches (plan.md, sections 7-8).
export function buildKeywordMatrix(): KeywordCombo[] {
  const combos: KeywordCombo[] = [];
  for (const zona of ZONAS) {
    for (const especialidad of ESPECIALIDADES) {
      for (const sufijo of SUFIJOS_BUSQUEDA) {
        combos.push({ keyword: buildKeyword(especialidad, sufijo, zona), especialidad, zona });
      }
    }
  }
  return combos;
}
