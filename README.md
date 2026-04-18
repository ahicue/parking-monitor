# Parking Monitor

Monitor monthly parking listings near your home in Japan and notify when new spots appear.

## What it does

- Geocodes your address with Japan's GSI address search API.
- Pulls listing data from multiple parking sites:
  - `p-king.jp`
  - `carparking.jp`
  - `park-direct.jp`
  - `navipark1.com`
  - `repark.jp`
  - `at-parking.jp`
  - `tokyo-parking.jp` (PMCマンスリーパーキング)
- Filters listings to a configurable radius such as `600m`.
- Stores seen listings in `data/state.json`.
- Notifies on newly seen or changed listings through:
  - console output
  - Windows desktop toast
  - Discord webhook
  - optional generic webhook

## Setup

```bash
cmd /c npm run init-config
```

Edit `config/config.json` and confirm:

- `homeAddress`
- `radiusMeters`
- `pollMinutes`
- `excludeMotorcycleParking`
- `minimumVehicleSizeMm`
- `sources`
- `notifications.discordWebhookUrl` if you want Discord alerts
- `notifications.webhookUrl` if you want another webhook target

## Discord

1. In Discord, open your channel settings.
2. Create an incoming webhook.
3. Paste the webhook URL into `notifications.discordWebhookUrl`.
4. Run the monitor.

## Usage

Run a single check:

```bash
cmd /c npm run check
```

Run continuous monitoring:

```bash
cmd /c npm start
```

## GitHub Actions

This repo includes a GitHub Actions workflow at `.github/workflows/parking-monitor.yml`.

It is configured to:

- run every 5 minutes
- run manually with `workflow_dispatch`
- update `data/state.json` in the repository after each check
- send Discord notifications through a GitHub secret
- exclude motorcycle and bike parking by default
- exclude undersized listings when the source exposes car dimensions

To enable it:

1. Push the `parking-monitor` folder into a GitHub repository.
2. Add a repository secret named `PARKING_MONITOR_DISCORD_WEBHOOK_URL`.
3. Make sure `data/state.json` is committed so the workflow has a baseline.
4. Enable Actions for the repository.

If you want different address or radius values in GitHub Actions, you can either edit `config/config.json` or add environment overrides later.

## Notes

- First run creates the baseline and will treat all current matches as new.
- Desktop toasts work on Windows.
- Site HTML structures may change over time. If they do, update the matching source file in `src/`.
