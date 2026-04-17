const { haversineMeters } = require("./distance");
const { fetchText } = require("./http");

function extractDetailLinks(html) {
  const matches = [...html.matchAll(/href="(\/parkinglot\/PK\d+)"/g)];
  return [...new Set(matches.map((match) => match[1]))];
}

function extractPageCount(html) {
  const matches = [...html.matchAll(/\?page=(\d+)/g)].map((match) =>
    Number(match[1])
  );
  return Math.max(1, ...matches.filter(Number.isFinite));
}

function extractNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function buildListingFromNextData(nextData, detailUrl, center) {
  const pageProps = nextData?.props?.pageProps;
  const card = pageProps?.parkingOutlineCardProps;
  if (!pageProps || !card) {
    return null;
  }

  const coordinates = {
    lat: Number(pageProps.latitude || card.lat),
    lng: Number(pageProps.longitude || card.lng),
  };

  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
    return null;
  }

  const distanceMeters = haversineMeters(center, coordinates);
  const idMatch = detailUrl.match(/\/parkinglot\/(PK\d+)/);
  const id = idMatch ? idMatch[1] : detailUrl;
  const partitionGroup = pageProps.partitionGroups?.[0];
  const fee =
    partitionGroup?.monthlyFeeModalProps?.total ||
    pageProps.nearbyParkings?.[0]?.monthlyFeeWithTax ||
    null;

  return {
    id,
    source: "park-direct",
    sourceLabel: "Park Direct",
    sourceSearchTerm: detailUrl,
    name: card.parkingLotName || `Park Direct ${id}`,
    address: `${card.city || ""}${card.municipality || ""}${card.address || ""}`.trim(),
    detailUrl: `https://www.park-direct.jp${detailUrl}`,
    coordinates,
    distanceMeters,
    monthlyPrice: fee ? `${fee} JPY` : "",
    prices: fee ? [`${fee} JPY`] : [],
    note: card.note || "",
    vacancyStatus:
      card.parkingLotStatus === 1
        ? "available"
        : card.parkingLotStatus === 2
          ? "waitlist"
          : "unknown",
    isNewData: Boolean(
      pageProps.partitionGroups?.some((group) => {
        const created = Date.parse(group.createdDatetime || "");
        const updated = Date.parse(group.updatedDatetime || "");
        const latest = Math.max(created || 0, updated || 0);
        return latest > Date.now() - 14 * 24 * 60 * 60 * 1000;
      })
    ),
    indoor: false,
    flat: Boolean(
      pageProps.partitionGroups?.some(
        (group) => group.featureProps?.parkingType
      )
    ),
    highRoof: /SUV|one box|high roof/i.test(
      JSON.stringify(pageProps.partitionGroups || [])
    ),
    largeVehicle: /SUV|one box|large/i.test(
      JSON.stringify(pageProps.partitionGroups || [])
    ),
    fetchedAt: new Date().toISOString(),
    updatedAt: partitionGroup?.updatedDatetime || null,
  };
}

async function fetchDetailListing(detailUrl, center) {
  const html = await fetchText(`https://www.park-direct.jp${detailUrl}`);
  const nextData = extractNextData(html);
  return buildListingFromNextData(nextData, detailUrl, center);
}

async function fetchAreaDetailLinks(sourceConfig) {
  const firstPageHtml = await fetchText(`${sourceConfig.baseUrl}${sourceConfig.areaPath}`);
  const pageCount = extractPageCount(firstPageHtml);
  const links = new Set(extractDetailLinks(firstPageHtml));

  for (let page = 2; page <= pageCount; page += 1) {
    const html = await fetchText(
      `${sourceConfig.baseUrl}${sourceConfig.areaPath}?page=${page}`
    );
    for (const link of extractDetailLinks(html)) {
      links.add(link);
    }
  }

  return [...links];
}

async function fetchNearbyListings(sourceConfig, globalConfig, center) {
  const detailLinks = await fetchAreaDetailLinks(sourceConfig);
  const listings = [];

  for (const detailLink of detailLinks) {
    const listing = await fetchDetailListing(detailLink, center);
    if (!listing) {
      continue;
    }

    if (listing.distanceMeters <= globalConfig.radiusMeters) {
      listings.push(listing);
    }
  }

  return listings.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

module.exports = {
  fetchNearbyListings,
};
