const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG_FILE = path.join(process.cwd(), "config", "config.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveStateFile(configPath, configuredStateFile) {
  if (!configuredStateFile) {
    return path.join(process.cwd(), "data", "state.json");
  }

  if (path.isAbsolute(configuredStateFile)) {
    return configuredStateFile;
  }

  return path.resolve(path.dirname(configPath), configuredStateFile);
}

function normalizeSources(config) {
  if (Array.isArray(config.sources) && config.sources.length > 0) {
    return config.sources;
  }

  return [
    {
      name: "p-king",
      baseUrl: "https://p-king.jp",
      searchTerms:
        Array.isArray(config.searchTerms) && config.searchTerms.length
          ? config.searchTerms
          : [config.homeAddress],
    },
  ];
}

function parseBooleanEnv(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function applyEnvOverrides(config) {
  const githubActions = process.env.GITHUB_ACTIONS === "true";

  if (process.env.PARKING_MONITOR_HOME_ADDRESS) {
    config.homeAddress = process.env.PARKING_MONITOR_HOME_ADDRESS;
  }

  if (process.env.PARKING_MONITOR_RADIUS_METERS) {
    config.radiusMeters = Number(process.env.PARKING_MONITOR_RADIUS_METERS);
  }

  if (process.env.PARKING_MONITOR_POLL_MINUTES) {
    config.pollMinutes = Number(process.env.PARKING_MONITOR_POLL_MINUTES);
  }

  if (process.env.PARKING_MONITOR_EXCLUDE_MOTORCYCLE_PARKING) {
    config.excludeMotorcycleParking = parseBooleanEnv(
      process.env.PARKING_MONITOR_EXCLUDE_MOTORCYCLE_PARKING,
      config.excludeMotorcycleParking
    );
  }

  if (process.env.PARKING_MONITOR_STATE_FILE) {
    config.stateFile = path.resolve(process.cwd(), process.env.PARKING_MONITOR_STATE_FILE);
  }

  config.notifications = {
    console: parseBooleanEnv(process.env.PARKING_MONITOR_CONSOLE, true),
    desktopToast: parseBooleanEnv(
      process.env.PARKING_MONITOR_DESKTOP_TOAST,
      githubActions ? false : true
    ),
    discordWebhookUrl: process.env.PARKING_MONITOR_DISCORD_WEBHOOK_URL || "",
    webhookUrl: process.env.PARKING_MONITOR_WEBHOOK_URL || "",
    ...config.notifications,
  };

  if (process.env.PARKING_MONITOR_DISCORD_WEBHOOK_URL) {
    config.notifications.discordWebhookUrl =
      process.env.PARKING_MONITOR_DISCORD_WEBHOOK_URL;
  }

  if (process.env.PARKING_MONITOR_WEBHOOK_URL) {
    config.notifications.webhookUrl = process.env.PARKING_MONITOR_WEBHOOK_URL;
  }

  config.notifications.console = parseBooleanEnv(
    process.env.PARKING_MONITOR_CONSOLE,
    config.notifications.console
  );

  config.notifications.desktopToast = parseBooleanEnv(
    process.env.PARKING_MONITOR_DESKTOP_TOAST,
    config.notifications.desktopToast
  );

  return config;
}

function loadConfig(configPath = DEFAULT_CONFIG_FILE) {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}. Run "npm run init-config" first.`
    );
  }

  const config = readJson(configPath);
  config.configPath = configPath;
  config.stateFile = resolveStateFile(configPath, config.stateFile);

  if (!config.homeAddress) {
    throw new Error("config.homeAddress is required.");
  }

  if (!Number.isFinite(config.radiusMeters) || config.radiusMeters <= 0) {
    config.radiusMeters = 600;
  }

  if (!Number.isFinite(config.pollMinutes) || config.pollMinutes <= 0) {
    config.pollMinutes = 30;
  }

  if (typeof config.excludeMotorcycleParking !== "boolean") {
    config.excludeMotorcycleParking = true;
  }

  config.notifications = {
    console: true,
    desktopToast: true,
    discordWebhookUrl: "",
    webhookUrl: "",
    ...config.notifications,
  };

  config.sources = normalizeSources(config);

  return applyEnvOverrides(config);
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function initConfig() {
  const examplePath = path.join(process.cwd(), "config", "config.example.json");
  const targetPath = DEFAULT_CONFIG_FILE;

  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  ensureParentDirectory(targetPath);
  fs.copyFileSync(examplePath, targetPath);
  return targetPath;
}

module.exports = {
  DEFAULT_CONFIG_FILE,
  ensureParentDirectory,
  initConfig,
  loadConfig,
};
