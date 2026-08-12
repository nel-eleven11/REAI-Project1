// Google Places doesn't tag a "zone" field either — direccion (formatted
// address) is the only place a real zone number shows up. Text Search can
// return places outside the searched zone entirely (matched on name/type,
// not location), so the searched zone is not reliable on its own.
const ZONE_PATTERN = /zona\s+(\d{1,2})\b/i;
const MIN_ZONE = 1;
const MAX_ZONE = 25;

export function extractZone(direccion: string): string | null {
  const match = direccion.match(ZONE_PATTERN);
  if (!match) return null;

  const zoneNumber = Number(match[1]);
  if (zoneNumber < MIN_ZONE || zoneNumber > MAX_ZONE) return null;

  return `zona ${zoneNumber}`;
}
