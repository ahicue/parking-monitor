const { haversineMeters } = require("./distance");
const { fetchText } = require("./http");
const { hasAnyKnownDimension, normalizeDimensionMm } = require("./size-utils");

function decodeHtmlEntities(input) {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractJsonProperties(html) {
  const match = html.match(/id="jsonProperties"[^>]*value="([\s\S]*?)"/);
  if (!match) {
    return [];
  }

  const decoded = decodeHtmlEntities(match[1]).trim();
  const normalized = decoded.replace(/,\s*]$/, "]");

  try {
    return JSON.parse(normalized);
  } catch (error) {
    throw new Error(`Failed to parse p-king listing payload: ${error.message}`);
  }
}

function parseLatLng(latLngString) {
  if (!latLngString || typeof latLngString !== "string") {
    return null;
  }

  const [lat, lng] = latLngString.split(",").map((value) => Number(value.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function mapVacancyStatus(value) {
  switch (Number(value)) {
    case 1:
      return "available";
    case 2:
      return "waitlist";
    case 3:
      return "contact";
    default:
      return "unknown";
  }
}

function extractSizeOptions(html) {
  const matches = [
    ...html.matchAll(
      /<th scope="row">全長\s*\/\s*全幅\s*\/<br>\s*全高\s*\/\s*重量<\/th>\s*<td>([\s\S]*?)<\/td>/g
    ),
  ];

  return matches
    .map((match) => {
      const values = [...match[1].matchAll(/<span>([^<]+)<\/span>/g)].map((valueMatch) =>
        valueMatch[1].trim()
      );

      return {
        lengthMm: normalizeDimensionMm(values[0]),
        widthMm: normalizeDimensionMm(values[1]),
        heightMm: normalizeDimensionMm(values[2]),
        raw: values.join(" / "),
      };
    })
    .filter(hasAnyKnownDimension);
}

async function enrichListingWithDetail(listing) {
  const html = await fetchText(listing.detailUrl);
  return {
    ...listing,
    sizeOptions: extractSizeOptions(html),
  };
}

function normalizeListing(entry, sourceBaseUrl, center, searchTerm) {
  const coordinates = parseLatLng(entry.lat_lan);
  if (!coordinates) {
    return null;
  }

  const distanceMeters = haversineMeters(center, coordinates);
  const propertyId = String(entry.propertyPublicId || "").trim();

  if (!propertyId) {
    return null;
  }

  const cabinCount = Number(entry.cabinCount) || 0;
  const prices = [];
  for (let index = 1; index <= cabinCount; index += 1) {
    const cabin = entry[`canbin${index}`];
    if (Array.isArray(cabin) && cabin[5]) {
      prices.push(String(cabin[5]));
    }
  }

  return {
    id: propertyId,
    source: "p-king",
    sourceLabel: "P-King",
    sourceSearchTerm: searchTerm,
    name: entry.name || `Parking ${propertyId}`,
    address: entry.address || "",
    detailUrl: `${sourceBaseUrl}/detail/${propertyId}`,
    coordinates,
    distanceMeters,
    monthlyPrice: entry.min_price || "",
    prices,
    note: entry.note || "",
    vacancyStatus: mapVacancyStatus(entry.vacancyStatus),
    isNewData: String(entry.isNewData || "").includes("icon-new.svg"),
    indoor: String(entry.isFacilityIndoor || "").includes("icon-okunai.svg"),
    flat: String(entry.isFacilityFlat || "").includes("icon-heimen.svg"),
    highRoof: String(entry.cabinFacilityHighRoof || "").includes("icon-highroof.svg"),
    largeVehicle: String(entry.cabinFacilityLarge || "").includes("icon-ogata.svg"),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchListingsForSearchTerm(searchTerm, sourceConfig, center) {
  const searchUrl =
    `${sourceConfig.baseUrl}/search_fw_map?freeWord=` +
    encodeURIComponent(searchTerm);

  const html = await fetchText(searchUrl);
  const rawEntries = extractJsonProperties(html);

  return rawEntries
    .map((entry) => normalizeListing(entry, sourceConfig.baseUrl, center, searchTerm))
    .filter(Boolean);
}

async function fetchNearbyListings(sourceConfig, globalConfig, center) {
  const allListings = [];

  for (const searchTerm of sourceConfig.searchTerms) {
    const listings = await fetchListingsForSearchTerm(searchTerm, sourceConfig, center);
    allListings.push(...listings);
  }

  const deduped = new Map();
  for (const listing of allListings) {
    if (listing.distanceMeters > globalConfig.radiusMeters) {
      continue;
    }

    const existing = deduped.get(listing.id);
    if (!existing || listing.distanceMeters < existing.distanceMeters) {
      deduped.set(listing.id, listing);
    }
  }

  const nearbyListings = [...deduped.values()].sort(
    (a, b) => a.distanceMeters - b.distanceMeters
  );

  const enrichedListings = [];
  for (const listing of nearbyListings) {
    try {
      enrichedListings.push(await enrichListingWithDetail(listing));
    } catch (error) {
      enrichedListings.push(listing);
    }
  }

  return enrichedListings;
}

module.exports = {
  fetchNearbyListings,
};
