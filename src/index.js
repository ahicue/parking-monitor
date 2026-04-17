const { initConfig, loadConfig } = require("./config");
const { geocodeAddress } = require("./geocode");
const { notifyAboutListings } = require("./notify");
const { fetchNearbyListings } = require("./sources");
const { diffListings, loadState, saveState } = require("./state");

async function runCheck(config) {
  const center = await geocodeAddress(config.homeAddress);
  const listings = await fetchNearbyListings(config, center);
  const state = loadState(config.stateFile);
  const { fresh, changed, nextState } = diffListings(state, listings);

  saveState(config.stateFile, nextState);

  console.log(
    `[${new Date().toLocaleString("ja-JP")}] checked ${listings.length} listings within ${config.radiusMeters}m of ${center.title}`
  );

  await notifyAboutListings(config, "Found new parking listings", fresh);
  await notifyAboutListings(config, "Parking listing details changed", changed);

  if (!fresh.length && !changed.length) {
    console.log("No new or changed listings.");
  }
}

async function runWatch(config) {
  const intervalMs = config.pollMinutes * 60 * 1000;
  let running = false;
  console.log(
    `Watching ${config.homeAddress} every ${config.pollMinutes} minutes within ${config.radiusMeters}m.`
  );

  await runCheck(config);

  setInterval(() => {
    if (running) {
      console.warn("[watch] Previous check is still running, skipping this interval.");
      return;
    }

    running = true;
    runCheck(config)
      .catch((error) => {
        console.error(`[watch] ${error.stack || error.message}`);
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
}

async function main() {
  const command = process.argv[2] || "check";

  if (command === "init-config") {
    const configPath = initConfig();
    console.log(`Created config at ${configPath}`);
    return;
  }

  const config = loadConfig();

  if (command === "check") {
    await runCheck(config);
    return;
  }

  if (command === "watch") {
    await runWatch(config);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
