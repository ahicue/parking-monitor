async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "parking-monitor/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

module.exports = {
  fetchText,
};
