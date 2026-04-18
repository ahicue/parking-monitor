const { haversineMeters } = require("./distance");
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

function extractAreaLinks(html) {
  const matches = [...html.matchAll(/href="(\/area\/[^"]+\/\d+)"/g)];
  return [...new Set(matches.map((match) => match[1]))];
}

function extractAreaItems(html) {
  const match = html.match(
    /<script id="map-initial-data" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) {
    return [];
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return [];
  }
}

function extractActiveLabels(osusumeHtml) {
  const matches = [
    ...String(osusumeHtml || "").matchAll(
      /images\/osusumes\/list\/active\/([^".]+)\.svg/gi
    ),
  ].map((match) => match[1]);

  return matches.map((key) => {
    switch (key) {
      case "high-roof":
        return "ハイルーフ車入庫可能";
      case "wide":
        return "ワイド車入庫可能";
      case "not-wet":
        return "雨に濡れない";
      case "flat":
        return "平面式";
      default:
        return key;
    }
  });
}

function buildListing(item, sourceSearchTerm, center) {
  const coordinates = {
    lat: Number(item.lat),
    lng: Number(item.lng),
  };

  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
    return null;
  }

  const activeLabels = extractActiveLabels(item.osusume_html);
  const monthlyPrice = stripTags(item.formatted_rent || "");
  const address = stripTags(item.formatted_address || "");

  return {
    id: String(item.formatted_number || item.detail_url || "").replace(/[^\d-]/g, ""),
    source: "pmc",
    sourceLabel: "PMC Monthly Parking",
    sourceSearchTerm,
    name: stripTags(item.publish_estate_name || ""),
    address,
    detailUrl: item.detail_url
      ? `https://www.tokyo-parking.jp${item.detail_url}`
      : "",
    coordinates,
    distanceMeters: haversineMeters(center, coordinates),
    monthlyPrice,
    prices: monthlyPrice && !/お問い合わせ/.test(monthlyPrice) ? [monthlyPrice] : [],
    note: activeLabels.join(" | "),
    vehicleType: activeLabels.join(" | "),
    vacancyStatus: item.vacant ? "available" : "unavailable",
    isNewData: false,
    indoor: activeLabels.includes("雨に濡れない"),
    flat: activeLabels.includes("平面式"),
    highRoof: activeLabels.includes("ハイルーフ車入庫可能"),
    largeVehicle: activeLabels.includes("ワイド車入庫可能"),
    fetchedAt: new Date().toISOString(),
    updatedAt: null,
  };
}

async function fetchNearbyListings(sourceConfig, globalConfig, center) {
  const areaPath = sourceConfig.areaPath;
  if (!areaPath) {
    throw new Error("pmc source requires areaPath");
  }

  const wardHtml = await fetchText(`https://www.tokyo-parking.jp${areaPath}`);
  const areaLinks = extractAreaLinks(wardHtml);
  const deduped = new Map();

  for (const areaLink of areaLinks) {
    const areaHtml = await fetchText(`https://www.tokyo-parking.jp${areaLink}`);
    const items = extractAreaItems(areaHtml);

    for (const item of items) {
      const listing = buildListing(item, areaLink, center);
      if (!listing || listing.distanceMeters > globalConfig.radiusMeters) {
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
