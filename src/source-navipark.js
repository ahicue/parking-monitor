const { haversineMeters } = require("./distance");
const { geocodeAddress } = require("./geocode");
const { fetchText } = require("./http");
const { extractLabeledDimensionsMm, hasAnyKnownDimension } = require("./size-utils");

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(input) {
  return decodeHtmlEntities(String(input || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractDetailLinks(html) {
  const matches = [...html.matchAll(/href="\.\.\/parkingDetail\/(N\d+)\.html"/g)];
  return [...new Set(matches.map((match) => match[1]))];
}

function extractTableValue(html, headerText) {
  const escapedHeader = headerText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<th[^>]*>${escapedHeader}<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractMonthlyPrice(html) {
  const monthlyOnlyText = stripTags(
    html.match(/こちらの駐車場は、月極区画のみとなっております。([\s\S]*?)駐車サービス券/u)?.[1] ||
      ""
  );
  const priceMatch = monthlyOnlyText.match(/[¥\\]\s*([\d,]+)\s*税込/);
  if (priceMatch) {
    return `${priceMatch[1]} JPY`;
  }

  const generalMatch = html.match(/[¥\\]\s*([\d,]+)\s*税込/u);
  return generalMatch ? `${generalMatch[1]} JPY` : "";
}

function extractSizeOptions(vehicleRestrictionText) {
  const sizeOption = {
    ...extractLabeledDimensionsMm(vehicleRestrictionText),
    raw: vehicleRestrictionText,
  };

  return hasAnyKnownDimension(sizeOption) ? [sizeOption] : [];
}

function isLikelyMonthlyListing(html, otherSpaces) {
  return otherSpaces > 0 || /月極区画/u.test(html);
}

async function fetchDetailListing(detailId, center) {
  const detailUrl = `https://www.navipark1.com/parkingDetail/${detailId}.html`;
  const html = await fetchText(detailUrl);

  const name = extractTableValue(html, "駐車場名");
  const address = extractTableValue(html, "所在地");
  const otherSpaces = Number(
    (extractTableValue(html, "その他区画").match(/\d+/) || [0])[0]
  );

  if (!name || !address || !isLikelyMonthlyListing(html, otherSpaces)) {
    return null;
  }

  const coordinates = await geocodeAddress(address);
  const distanceMeters = haversineMeters(center, coordinates);
  const vehicleRestrictionText = extractTableValue(html, "車両制限");
  const monthlyPrice = extractMonthlyPrice(html);

  return {
    id: detailId,
    source: "navipark",
    sourceLabel: "NaviPark",
    sourceSearchTerm: address,
    name,
    address,
    detailUrl,
    coordinates: {
      lat: coordinates.lat,
      lng: coordinates.lng,
    },
    distanceMeters,
    monthlyPrice,
    prices: monthlyPrice ? [monthlyPrice] : [],
    note: stripTags(html.match(/<th>料金体系<\/th>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i)?.[1] || ""),
    vehicleType: vehicleRestrictionText,
    sizeOptions: extractSizeOptions(vehicleRestrictionText),
    vacancyStatus: otherSpaces > 0 ? "unknown" : "unavailable",
    isNewData: false,
    indoor: false,
    flat: true,
    highRoof: /高さ\s*2(?:[.,]0|[.,]1)?m/u.test(vehicleRestrictionText),
    largeVehicle: /長さ\s*5(?:[.,]0)?m/u.test(vehicleRestrictionText),
    fetchedAt: new Date().toISOString(),
    updatedAt: null,
  };
}

async function fetchListingsForSearchTerm(searchTerm, center) {
  const searchUrl =
    "https://www.navipark1.com/search/parkingList.php?freewordType=1&freewordText=" +
    encodeURIComponent(searchTerm);
  const html = await fetchText(searchUrl);
  const detailIds = extractDetailLinks(html);
  const listings = [];

  for (const detailId of detailIds) {
    try {
      const listing = await fetchDetailListing(detailId, center);
      if (listing) {
        listings.push(listing);
      }
    } catch (error) {
      // Ignore individual detail failures so one bad page does not block the source.
    }
  }

  return listings;
}

async function fetchNearbyListings(sourceConfig, globalConfig, center) {
  const searchTerms =
    Array.isArray(sourceConfig.searchTerms) && sourceConfig.searchTerms.length > 0
      ? sourceConfig.searchTerms
      : [globalConfig.homeAddress];

  const deduped = new Map();

  for (const searchTerm of searchTerms) {
    const listings = await fetchListingsForSearchTerm(searchTerm, center);
    for (const listing of listings) {
      if (listing.distanceMeters > globalConfig.radiusMeters) {
        continue;
      }

      const existing = deduped.get(listing.id);
      if (!existing || listing.distanceMeters < existing.distanceMeters) {
        deduped.set(listing.id, listing);
      }
    }
  }

  return [...deduped.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

module.exports = {
  fetchNearbyListings,
};
