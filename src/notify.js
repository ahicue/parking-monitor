const { execFile } = require("child_process");

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

function getPriceLabel(listing) {
  return listing.monthlyPrice || "price unknown";
}

function buildMessage(listing) {
  const price = getPriceLabel(listing);
  const distance = `${Math.round(listing.distanceMeters)}m`;
  const source = listing.sourceLabel || listing.source;
  return `[${source}] ${listing.name} | ${price} | ${distance} | ${listing.detailUrl}`;
}

async function sendDesktopToast(title, message) {
  const script =
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;" +
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null;" +
    `$xml = New-Object Windows.Data.Xml.Dom.XmlDocument;` +
    `$xml.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>${escapeXml(
      title
    )}</text><text>${escapeXml(message)}</text></binding></visual></toast>');` +
    `$toast = [Windows.UI.Notifications.ToastNotification]::new($xml);` +
    `$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('ParkingMonitor');` +
    `$notifier.Show($toast);`;

  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function sendGenericWebhook(webhookUrl, title, listings) {
  await postJson(webhookUrl, {
    text: `${title}\n${listings.map(buildMessage).join("\n")}`,
  });
}

function buildDiscordEmbeds(listings) {
  return listings.slice(0, 10).map((listing) => ({
    title: listing.name,
    url: listing.detailUrl,
    description: [
      `Source: ${listing.sourceLabel || listing.source}`,
      `Price: ${getPriceLabel(listing)}`,
      `Distance: ${Math.round(listing.distanceMeters)}m`,
      listing.note ? `Note: ${listing.note.slice(0, 400)}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    color: listing.isNewData ? 3066993 : 3447003,
    fields: [
      {
        name: "Vacancy",
        value: listing.vacancyStatus || "unknown",
        inline: true,
      },
      {
        name: "Address",
        value: listing.address || "unknown",
        inline: true,
      },
    ],
    timestamp: listing.fetchedAt,
  }));
}

async function sendDiscordWebhook(discordWebhookUrl, title, listings) {
  const embeds = buildDiscordEmbeds(listings);
  await postJson(discordWebhookUrl, {
    username: "Parking Monitor",
    content: title,
    embeds,
  });
}

async function notifyAboutListings(config, heading, listings) {
  if (!listings.length) {
    return;
  }

  if (config.notifications.console) {
    console.log(`\n${heading}`);
    for (const listing of listings) {
      console.log(`- ${buildMessage(listing)}`);
    }
  }

  if (config.notifications.desktopToast) {
    const toastTitle =
      listings.length === 1 ? heading : `${heading} (${listings.length} items)`;
    const toastBody = listings
      .slice(0, 3)
      .map(
        (listing) =>
          `[${listing.sourceLabel || listing.source}] ${getPriceLabel(listing)} / ${Math.round(listing.distanceMeters)}m / ${listing.name}`
      )
      .join(" | ");

    try {
      await sendDesktopToast(toastTitle, toastBody);
    } catch (error) {
      console.warn(`Desktop toast failed: ${error.message}`);
    }
  }

  if (config.notifications.discordWebhookUrl) {
    try {
      await sendDiscordWebhook(config.notifications.discordWebhookUrl, heading, listings);
    } catch (error) {
      console.warn(`Discord webhook failed: ${error.message}`);
    }
  }

  if (config.notifications.webhookUrl) {
    try {
      await sendGenericWebhook(config.notifications.webhookUrl, heading, listings);
    } catch (error) {
      console.warn(`Webhook notification failed: ${error.message}`);
    }
  }
}

module.exports = {
  notifyAboutListings,
};
