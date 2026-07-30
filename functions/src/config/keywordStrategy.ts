export const SPECIALTIES = [
  "cardiología",
  "pediatría",
  "dermatología",
  "ginecología",
  "ortopedia",
  "oftalmología",
  "traumatología",
  "psiquiatría",
] as const;

export type Specialty = (typeof SPECIALTIES)[number];

export const ZONES = Array.from({ length: 18 }, (_, i) => `zona ${i + 1}`);

export const SEARCH_PREFIXES = ["médico", "doctor", "clínica", "consultorio"] as const;

export type SearchPrefix = (typeof SEARCH_PREFIXES)[number];

export interface KeywordCombo {
  keyword: string;
  specialty: Specialty;
  zone: string;
}

export function buildKeyword(specialty: Specialty, prefix: SearchPrefix, zone: string): string {
  return `${prefix} ${specialty} ${zone} Guatemala`;
}

// Same number of combinations per zone (plan.md sections 7-8).
export function buildKeywordMatrix(): KeywordCombo[] {
  const combos: KeywordCombo[] = [];
  for (const zone of ZONES) {
    for (const specialty of SPECIALTIES) {
      for (const prefix of SEARCH_PREFIXES) {
        combos.push({ keyword: buildKeyword(specialty, prefix, zone), specialty, zone });
      }
    }
  }
  return combos;
}
