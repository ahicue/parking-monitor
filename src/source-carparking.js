const { haversineMeters } = require("./distance");
const { fetchText } = require("./http");
const { extractLabeledDimensionsMm, hasAnyKnownDimension } = require("./size-utils");

function extractDetailLinks(html) {
  const matches = [...html.matchAll(/href="(\/detail\/\d+\/?)"/g)];
  return [...new Set(matches.map((match) => match[1]))];
}

function extractPageCount(html) {
  const matches = [...html.matchAll(/\?page=(\d+)/g)].map((match) =>
    Number(match[1])
  );
  return Math.max(1, ...matches.filter(Number.isFinite));
}

function extractJsonLd(html) {
  const matches = [
    ...html.matchAll(/<script[^>]+type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ];

  for (const match of matches) {
    try {
      const payload = JSON.parse(match[1]);
      if (payload?.["@type"] === "ParkingFacility") {
        return payload;
      }
    } catch (error) {
      // Ignore malformed blocks and keep scanning.
    }
  }

  return null;
}

function extractUpdatedAt(html) {
  const match = html.match(/name="az_hash_updated_datetime" content="([^"]+)"/);
  return match ? match[1] : null;
}

function extractSizeOptions(jsonLd) {
  const sizeText = [
    ...(Array.isArray(jsonLd.additionalProperty)
      ? jsonLd.additionalProperty
          .filter((property) =>
            /車室サイズ|全長|全幅|全高|車高/i.test(
              `${property?.name || ""} ${property?.value || ""}`
            )
          )
          .map((property) => `${property?.name || ""} ${property?.value || ""}`)
      : []),
    ...(Array.isArray(jsonLd.amenityFeature)
      ? jsonLd.amenityFeature
          .filter((feature) =>
            /車室サイズ|全長|全幅|全高|車高/i.test(
              `${feature?.name || ""} ${feature?.value || ""}`
            )
          )
          .map((feature) => `${feature?.name || ""} ${feature?.value || ""}`)
      : []),
  ].join(" | ");

  const sizeOption = {
    ...extractLabeledDimensionsMm(sizeText),
    raw: sizeText,
  };

  return hasAnyKnownDimension(sizeOption) ? [sizeOption] : [];
}

async function fetchListingDetail(detailUrl, sourceConfig, center) {
  const fullUrl = `${sourceConfig.baseUrl}${detailUrl}`;
  const html = await fetchText(fullUrl);
  const jsonLd = extractJsonLd(html);

  if (!jsonLd?.geo?.latitude || !jsonLd?.geo?.longitude) {
    return null;
  }

  const coordinates = {
    lat: Number(jsonLd.geo.latitude),
    lng: Number(jsonLd.geo.longitude),
  };

  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
    return null;
  }

  const idMatch = detailUrl.match(/\/detail\/(\d+)/);
  const id = idMatch ? idMatch[1] : detailUrl;
  const distanceMeters = haversineMeters(center, coordinates);
  const description = jsonLd.description || "";

  return {
    id,
    source: "carparking",
    sourceLabel: "CarParking",
    sourceSearchTerm: sourceConfig.areaPath,
    name: jsonLd.name || `CarParking ${id}`,
    address:
      jsonLd.address?.streetAddress ||
      `${jsonLd.address?.addressRegion || ""}${jsonLd.address?.addressLocality || ""}`.trim(),
    detailUrl: fullUrl,
    coordinates,
    distanceMeters,
    monthlyPrice:
      jsonLd.priceRange ||
      (jsonLd.offers?.price ? `${jsonLd.offers.price} JPY` : ""),
    prices: jsonLd.offers?.price ? [`${jsonLd.offers.price} JPY`] : [],
    note: jsonLd.offers?.description || "",
    vehicleType: Array.isArray(jsonLd.additionalProperty)
      ? jsonLd.additionalProperty.map((property) => property?.value).filter(Boolean).join(" | ")
      : "",
    sizeOptions: extractSizeOptions(jsonLd),
    vacancyStatus: "unknown",
    isNewData: Boolean(extractUpdatedAt(html)),
    indoor: /indoor/i.test(description),
    flat: /flat|asphalt|parking/i.test(description),
    highRoof: /high roof/i.test(description),
    largeVehicle: /SUV|large|one box|van/i.test(description),
    fetchedAt: new Date().toISOString(),
    updatedAt: extractUpdatedAt(html),
  };
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
    const listing = await fetchListingDetail(detailLink, sourceConfig, center);
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
