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

// Ordered prefix-major (not zone-major): the first 144 combos (SPECIALTIES x
// ZONES for the médico prefix) already cover every cell of the zona x
// especialidad grid once, before repeating any cell with a second search
// variant. Exhausting one zone or specialty completely before touching the
// rest — the previous order — leaves most of the heatmap showing "never
// searched" for a long time even though searches did happen, just
// concentrated. This way partial progress is representative of the whole
// grid, not just the first few rows (plan.md sections 7-8).
export function buildKeywordMatrix(): KeywordCombo[] {
  const combos: KeywordCombo[] = [];
  for (const prefix of SEARCH_PREFIXES) {
    for (const zone of ZONES) {
      for (const specialty of SPECIALTIES) {
        combos.push({ keyword: buildKeyword(specialty, prefix, zone), specialty, zone });
      }
    }
  }
  return combos;
}
