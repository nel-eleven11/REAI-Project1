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

// Cobertura balanceada: mismo numero de combinaciones por zona,
// para no contaminar la auditoria de sesgo con busquedas desiguales (plan.md, seccion 7-8).
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
