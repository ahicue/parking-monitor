const MOTORCYCLE_PATTERNS = [
  /motorcycle/i,
  /motorbike/i,
  /\bbike\b/i,
  /scooter/i,
  /moped/i,
  /bicycle/i,
  /バイク/,
  /オートバイ/,
  /二輪/,
  /原付/,
  /自転車/,
];

function isMotorcycleListing(listing) {
  const text = [
    listing.name,
    listing.note,
    listing.address,
    listing.vehicleType,
    listing.vehicleKinds,
  ]
    .filter(Boolean)
    .join("\n");

  return MOTORCYCLE_PATTERNS.some((pattern) => pattern.test(text));
}

function filterUnsupportedListings(listings, config = {}) {
  const excludeMotorcycleParking = config.excludeMotorcycleParking !== false;

  return listings.filter((listing) => {
    if (excludeMotorcycleParking && isMotorcycleListing(listing)) {
      return false;
    }

    return true;
  });
}

module.exports = {
  filterUnsupportedListings,
  isMotorcycleListing,
};
