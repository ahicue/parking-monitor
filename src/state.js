const fs = require("fs");

const { ensureParentDirectory } = require("./config");

function loadState(stateFile) {
  if (!fs.existsSync(stateFile)) {
    return { listings: {}, lastCheckAt: null };
  }

  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function saveState(stateFile, state) {
  ensureParentDirectory(stateFile);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function createFingerprint(listing) {
  return JSON.stringify({
    monthlyPrice: listing.monthlyPrice,
    prices: listing.prices,
    vacancyStatus: listing.vacancyStatus,
    note: listing.note,
    isNewData: listing.isNewData,
    updatedAt: listing.updatedAt || null,
  });
}

function diffListings(previousState, currentListings) {
  const fresh = [];
  const changed = [];
  const nextMap = {};

  for (const listing of currentListings) {
    const fingerprint = createFingerprint(listing);
    const stateKey = `${listing.source}:${listing.id}`;
    const previous = previousState.listings?.[stateKey];

    nextMap[stateKey] = {
      fingerprint,
      lastSeenAt: listing.fetchedAt,
      summary: {
        source: listing.source,
        name: listing.name,
        monthlyPrice: listing.monthlyPrice,
        vacancyStatus: listing.vacancyStatus,
        distanceMeters: Math.round(listing.distanceMeters),
        detailUrl: listing.detailUrl,
      },
    };

    if (!previous) {
      fresh.push(listing);
      continue;
    }

    if (previous.fingerprint !== fingerprint) {
      changed.push(listing);
    }
  }

  return {
    fresh,
    changed,
    nextState: {
      listings: nextMap,
      lastCheckAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  diffListings,
  loadState,
  saveState,
};
