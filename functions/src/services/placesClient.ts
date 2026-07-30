const TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const MAX_RESULTS_PER_INVOCATION = 20;

interface TextSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry?: { location?: { lat: number; lng: number } };
}

interface TextSearchResponse {
  status: string;
  error_message?: string;
  results: TextSearchResult[];
}

interface DetailsResult {
  formatted_phone_number?: string;
  website?: string;
}

interface DetailsResponse {
  status: string;
  error_message?: string;
  result?: DetailsResult;
}

export interface PlaceWithDetails {
  place_id: string;
  nombre: string;
  direccion: string;
  lat: number | null;
  lng: number | null;
  telefono: string | null;
  sitio_web: string | null;
}

export interface PlacesSearchOutcome {
  places: PlaceWithDetails[];
  apiCalls: number;
}

export async function searchPlaces(keyword: string, apiKey: string): Promise<PlacesSearchOutcome> {
  const searchUrl = new URL(TEXT_SEARCH_URL);
  searchUrl.searchParams.set("query", keyword);
  searchUrl.searchParams.set("key", apiKey);

  const searchResponse = await fetch(searchUrl);
  const searchBody = (await searchResponse.json()) as TextSearchResponse;

  if (searchBody.status !== "OK" && searchBody.status !== "ZERO_RESULTS") {
    throw new Error(`Places Text Search failed: ${searchBody.status} ${searchBody.error_message ?? ""}`);
  }

  const rawResults = searchBody.results.slice(0, MAX_RESULTS_PER_INVOCATION);
  let apiCalls = 1;

  const places: PlaceWithDetails[] = [];
  for (const result of rawResults) {
    const details = await fetchPlaceDetails(result.place_id, apiKey);
    apiCalls += 1;

    places.push({
      place_id: result.place_id,
      nombre: result.name,
      direccion: result.formatted_address,
      lat: result.geometry?.location?.lat ?? null,
      lng: result.geometry?.location?.lng ?? null,
      telefono: details?.formatted_phone_number ?? null,
      sitio_web: details?.website ?? null,
    });
  }

  return { places, apiCalls };
}

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<DetailsResult | null> {
  const detailsUrl = new URL(DETAILS_URL);
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "formatted_phone_number,website");
  detailsUrl.searchParams.set("key", apiKey);

  const detailsResponse = await fetch(detailsUrl);
  const detailsBody = (await detailsResponse.json()) as DetailsResponse;

  if (detailsBody.status !== "OK") {
    return null;
  }

  return detailsBody.result ?? null;
}

interface FullDetailsResult extends DetailsResult {
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
}

interface FullDetailsResponse {
  status: string;
  error_message?: string;
  result?: FullDetailsResult;
}

// Returns null if the place no longer exists or the query fails, so the
// caller (purgeExpiredRecords) can purge instead.
export async function searchPlaceById(placeId: string, apiKey: string): Promise<PlaceWithDetails | null> {
  const detailsUrl = new URL(DETAILS_URL);
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set(
    "fields",
    "place_id,name,formatted_address,formatted_phone_number,website,geometry"
  );
  detailsUrl.searchParams.set("key", apiKey);

  try {
    const detailsResponse = await fetch(detailsUrl);
    const detailsBody = (await detailsResponse.json()) as FullDetailsResponse;

    if (detailsBody.status !== "OK" || !detailsBody.result) {
      return null;
    }

    const result = detailsBody.result;
    return {
      place_id: placeId,
      nombre: result.name ?? "",
      direccion: result.formatted_address ?? "",
      lat: result.geometry?.location?.lat ?? null,
      lng: result.geometry?.location?.lng ?? null,
      telefono: result.formatted_phone_number ?? null,
      sitio_web: result.website ?? null,
    };
  } catch (error) {
    console.error(`searchPlaceById: fetch failed for place_id=${placeId}`, error);
    return null;
  }
}
