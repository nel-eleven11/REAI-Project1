import { SPECIALTIES, type Specialty } from "../config/keywordStrategy";

// Google Places has no specialty field — this is the only place we look for
// it. Word stems (not full words) so gender/number variants (cardiólogo,
// cardióloga, cardiología, cardiovascular) all match without listing each one.
const SYNONYMS: Record<Specialty, string[]> = {
  cardiología: ["cardiolog", "cardiovascular", "cardiac", "corazon"],
  pediatría: ["pediatr", "infantil", "nino", "niña"],
  dermatología: ["dermatolog", "piel"],
  ginecología: ["ginecolog", "obstetr"],
  ortopedia: ["ortoped"],
  oftalmología: ["oftalmolog", "vision"],
  traumatología: ["traumatolog"],
  psiquiatría: ["psiquiatr", "salud mental"],
};

const MATCH_CONFIDENCE = 0.9;
const NO_MATCH_CONFIDENCE = 0;

function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface NormalizationResult {
  especialidad_normalizada: Specialty | null;
  confidence: number;
}

export function normalizeSpecialty(nombre: string): NormalizationResult {
  const normalized = stripAccents(nombre);

  for (const specialty of SPECIALTIES) {
    if (SYNONYMS[specialty].some((synonym) => normalized.includes(synonym))) {
      return { especialidad_normalizada: specialty, confidence: MATCH_CONFIDENCE };
    }
  }

  return { especialidad_normalizada: null, confidence: NO_MATCH_CONFIDENCE };
}
