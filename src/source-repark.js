const { haversineMeters } = require("./distance");
const { geocodeAddress } = require("./geocode");
const { fetchText } = require("./http");

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

function extractBlocks(html) {
  return [...html.matchAll(/<div class="parking kakomi type-border[\s\S]*?<\/table>\s*<\/div>/g)].map(
    (match) => match[0]
  );
}

function extractValue(block, headerText) {
  const escapedHeader = headerText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<th[^>]*>${escapedHeader}<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  const match = block.match(pattern);
  return match ? stripTags(match[1]) : "";
}

async function buildListing(block, center) {
  const detailUrl = block.match(/<a href="([^"]+)"/i)?.[1] || "";
  const name = stripTags(block.match(/<h4[^>]*>[\s\S]*?<span class="label">([\s\S]*?)<\/span>/i)?.[1] || "");
  const address = stripTags(block.match(/<div class="data">[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] || "");

  if (!detailUrl || !name || !address) {
    return null;
  }

  const coordinates = await geocodeAddress(address);
  const distanceMeters = haversineMeters(center, coordinates);
  const vehicleType = extractValue(block, "駐車可能車両");
  const parkingCount = extractValue(block, "駐車場台数");
  const parkingType = extractValue(block, "駐車形式");
  const monthlyPrice = extractValue(block, "月額賃料");
  const note = [
    parkingCount ? `駐車場台数: ${parkingCount}` : "",
    parkingType ? `駐車形式: ${parkingType}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    id: detailUrl,
    source: "repark",
    sourceLabel: "Repark",
    sourceSearchTerm: "current-location",
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
    note,
    vehicleType,
    vacancyStatus: /空きあり|募集中/u.test(block)
      ? "available"
      : /空き待ち|予約受付/u.test(block)
        ? "waitlist"
        : "unknown",
    isNewData: /new|新規/u.test(block),
    indoor: false,
    flat: /平置き/u.test(parkingType),
    highRoof: /ハイルーフ/u.test(vehicleType),
    largeVehicle: /大きめ|ハイルーフ/u.test(vehicleType),
    fetchedAt: new Date().toISOString(),
    updatedAt: null,
  };
}

async function fetchNearbyListings(sourceConfig, globalConfig, center) {
  const params = new URLSearchParams({
    search_now_latitude: String(center.lat),
    search_now_longitude: String(center.lng),
    search_current_location: "1",
    search_current_location_map: "0",
    search_type: "keyword",
  });

  const html = await fetchText("https://www.repark.jp/parking_user/monthly/result/list", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const blocks = extractBlocks(html);
  const listings = [];

  for (const block of blocks) {
    try {
      const listing = await buildListing(block, center);
      if (listing && listing.distanceMeters <= globalConfig.radiusMeters) {
        listings.push(listing);
      }
    } catch (error) {
      // Ignore individual listing parse failures.
    }
  }

  return listings.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

module.exports = {
  fetchNearbyListings,
};
