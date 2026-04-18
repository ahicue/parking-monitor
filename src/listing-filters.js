const { hasAnyKnownDimension, normalizeDimensionMm } = require("./size-utils");

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

function getRequiredVehicleSizeMm(config = {}) {
  return {
    lengthMm: normalizeDimensionMm(
      config.minimumVehicleSizeMm?.lengthMm ?? 4660
    ),
    widthMm: normalizeDimensionMm(
      config.minimumVehicleSizeMm?.widthMm ?? 1865
    ),
    heightMm: normalizeDimensionMm(
      config.minimumVehicleSizeMm?.heightMm ?? 1660
    ),
  };
}

function getComparableSizeOptions(listing) {
  const sizeOptions = Array.isArray(listing.sizeOptions)
    ? listing.sizeOptions
    : listing.sizeLimits
      ? [listing.sizeLimits]
      : [];

  return sizeOptions
    .map((option) => ({
      ...option,
      lengthMm: normalizeDimensionMm(option.lengthMm),
      widthMm: normalizeDimensionMm(option.widthMm),
      heightMm: normalizeDimensionMm(option.heightMm),
    }))
    .filter(hasAnyKnownDimension);
}

function optionHasInsufficientDimension(option, requiredVehicleSizeMm) {
  return (
    (Number.isFinite(option.lengthMm) &&
      option.lengthMm < requiredVehicleSizeMm.lengthMm) ||
    (Number.isFinite(option.widthMm) &&
      option.widthMm < requiredVehicleSizeMm.widthMm) ||
    (Number.isFinite(option.heightMm) &&
      option.heightMm < requiredVehicleSizeMm.heightMm)
  );
}

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
  const requiredVehicleSizeMm = getRequiredVehicleSizeMm(config);

  return listings.filter((listing) => {
    if (excludeMotorcycleParking && isMotorcycleListing(listing)) {
      return false;
    }

    const comparableSizeOptions = getComparableSizeOptions(listing);
    if (
      comparableSizeOptions.length > 0 &&
      comparableSizeOptions.every((option) =>
        optionHasInsufficientDimension(option, requiredVehicleSizeMm)
      )
    ) {
      return false;
    }

    return true;
  });
}

module.exports = {
  filterUnsupportedListings,
  isMotorcycleListing,
};
