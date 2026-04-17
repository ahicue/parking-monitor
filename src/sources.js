const { fetchNearbyListings: fetchPKingListings } = require("./source-pking");
const { fetchNearbyListings: fetchCarParkingListings } = require("./source-carparking");
const { fetchNearbyListings: fetchParkDirectListings } = require("./source-park-direct");

const SOURCE_HANDLERS = {
  "p-king": fetchPKingListings,
  carparking: fetchCarParkingListings,
  "park-direct": fetchParkDirectListings,
};

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
      allListings.push(...listings);
      console.log(
        `[source:${sourceConfig.name}] ${listings.length} listings within ${config.radiusMeters}m`
      );
    } catch (error) {
      console.warn(`[source:${sourceConfig.name}] ${error.message}`);
    }
  }

  return allListings.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

module.exports = {
  fetchNearbyListings,
};
