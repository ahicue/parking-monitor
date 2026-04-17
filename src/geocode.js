async function geocodeAddress(address) {
  const url =
    "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" +
    encodeURIComponent(address);

  const response = await fetch(url, {
    headers: {
      "user-agent": "parking-monitor/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to geocode address: ${response.status}`);
  }

  const features = await response.json();
  const first = features[0];

  if (!first || !first.geometry || !Array.isArray(first.geometry.coordinates)) {
    throw new Error(`No geocoding result for address: ${address}`);
  }

  const [lng, lat] = first.geometry.coordinates;
  return {
    lat,
    lng,
    title: first.properties?.title || address,
  };
}

module.exports = {
  geocodeAddress,
};
