const { haversineMeters } = require("./distance");
const { fetchText } = require("./http");
const { hasAnyKnownDimension, normalizeDimensionMm } = require("./size-utils");

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

function extractResultListings(html, searchTerm) {
  const matches = [
    ...html.matchAll(
      /<a href="(\/search\/[^"]+\/(\d+)\.html)"\s+onmouseover="mousein\(\d+\)"[\s\S]*?>([^<]+)<\/a><br>\s*<span class="sStl">([^<]+)<\/span>[\s\S]*?<img src="\/images\/detail\/icon_status\d+\.svg" alt="([^"]+)"/g
    ),
  ];

  return matches.map((match) => {
    const summaryText = stripTags(match[4]);
    const parts = summaryText.split(/\s*\/\s*/);
    const monthlyPrice = parts.pop() || "";
    const address = parts.join(" / ");

    return {
      id: match[2],
      source: "at-parking",
      sourceLabel: "at PARKING",
      sourceSearchTerm: searchTerm,
      name: stripTags(match[3]),
      address,
      detailUrl: `https://www.at-parking.jp${match[1]}`,
      monthlyPrice,
      prices: monthlyPrice && monthlyPrice !== "-" ? [monthlyPrice] : [],
      vacancyStatus: /空きあり/u.test(match[5])
        ? "available"
        : /空き待ち/u.test(match[5])
          ? "waitlist"
          : /満車/u.test(match[5])
            ? "unavailable"
            : "unknown",
      statusText: match[5],
    };
  });
}

function extractTableValue(html, headerText) {
  const escapedHeader = headerText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<td[^>]*class="ctgr"[^>]*>${escapedHeader}<\\/td>\\s*<td[^>]*class="dtlDisplay"[^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractCoordinates(html) {
  const lat = Number(
    html.match(/<input type="hidden" class="lat" name="lat" value="([^"]+)"/i)?.[1]
  );
  const lng = Number(
    html.match(/<input type="hidden" class="lng" name="lng" value="([^"]+)"/i)?.[1]
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function extractSizeOptions(html) {
  const matches = [
    ...html.matchAll(
      /<div>全高\s*([^<]+)<\/div>\s*<div>全幅\s*([^<]+)<\/div>\s*<div>全長\s*([^<]+)<\/div>[\s\S]*?<div>重量\s*([^<]+)<\/div>/g
    ),
  ];

  return matches
    .map((match) => ({
      heightMm: normalizeDimensionMm(stripTags(match[1])),
      widthMm: normalizeDimensionMm(stripTags(match[2])),
      lengthMm: normalizeDimensionMm(stripTags(match[3])),
      raw: stripTags(match[0]),
    }))
    .filter(hasAnyKnownDimension);
}

async function enrichListingFromDetail(listing, center) {
  const html = await fetchText(listing.detailUrl);
  const coordinates = extractCoordinates(html);

  if (!coordinates) {
    return null;
  }

  const detailAddress = extractTableValue(html, "駐車場所在地") || listing.address;
  const sizeOptions = extractSizeOptions(html);
  const featureText = stripTags(
    html.match(/<h1><span id="prptName">[\s\S]*?<\/h1>/i)?.[0] || ""
  );

  return {
    ...listing,
    address: detailAddress,
    coordinates,
    distanceMeters: haversineMeters(center, coordinates),
    note: featureText,
    vehicleType: featureText,
    sizeOptions,
    indoor: /屋内/u.test(featureText),
    flat: /平置|自走式/u.test(featureText),
    highRoof: /ハイルーフ/u.test(featureText),
    largeVehicle: /大型/u.test(featureText),
    fetchedAt: new Date().toISOString(),
    updatedAt: null,
  };
}

async function fetchListingsForSearchTerm(searchTerm, center) {
  const searchUrl =
    "https://www.at-parking.jp/result/index.php?action=input&text_input=" +
    encodeURIComponent(searchTerm);
  const html = await fetchText(searchUrl);
  const resultListings = extractResultListings(html, searchTerm);
  const listings = [];

  for (const listing of resultListings) {
    try {
      const enriched = await enrichListingFromDetail(listing, center);
      if (enriched) {
        listings.push(enriched);
      }
    } catch (error) {
      // Ignore per-listing detail failures so one bad page does not block the source.
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
