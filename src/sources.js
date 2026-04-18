const { fetchNearbyListings: fetchPKingListings } = require("./source-pking");
const { fetchNearbyListings: fetchCarParkingListings } = require("./source-carparking");
const { fetchNearbyListings: fetchParkDirectListings } = require("./source-park-direct");
const { fetchNearbyListings: fetchNaviParkListings } = require("./source-navipark");
const { fetchNearbyListings: fetchReparkListings } = require("./source-repark");
const { filterUnsupportedListings } = require("./listing-filters");

const SOURCE_HANDLERS = {
  "p-king": fetchPKingListings,
  carparking: fetchCarParkingListings,
  "park-direct": fetchParkDirectListings,
  navipark: fetchNaviParkListings,
  repark: fetchReparkListings,
};

function normalizeDetailUrl(detailUrl) {
  return String(detailUrl || "").replace(/\/+$/, "");
}

function listingRichnessScore(listing) {
  return [
    listing.monthlyPrice,
    listing.note,
    listing.vehicleType,
    listing.vehicleKinds,
    Array.isArray(listing.sizeOptions) && listing.sizeOptions.length > 0 ? "size" : "",
    listing.updatedAt,
  ].filter(Boolean).length;
}

function dedupeListings(listings) {
  const deduped = new Map();

  for (const listing of listings) {
    const key = normalizeDetailUrl(listing.detailUrl) || `${listing.source}:${listing.id}`;
    const existing = deduped.get(key);
    if (!existing || listingRichnessScore(listing) > listingRichnessScore(existing)) {
      deduped.set(key, listing);
    }
  }

  return [...deduped.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

async function fetchNearbyListings(config, center) {
  const sources = config.sources || [];
  const allListings = [];

  for (const sourceConfig of sources) {
    const fetcher = SOURCE_HANDLERS[sourceConfig.name];
    if (!fetcher) {
      console.warn(`Skipping unsupported source: ${sourceConfig.name}`);
      continue;
    }

    try {
      const listings = await fetcher(sourceConfig, config, center);
      const filteredListings = filterUnsupportedListings(listings, config);
      allListings.push(...filteredListings);
      console.log(
        `[source:${sourceConfig.name}] ${filteredListings.length} listings within ${config.radiusMeters}m`
      );
    } catch (error) {
      console.warn(`[source:${sourceConfig.name}] ${error.message}`);
    }
  }

  return dedupeListings(allListings);
}

module.exports = {
  fetchNearbyListings,
};
