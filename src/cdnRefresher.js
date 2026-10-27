function isUrlExpired(url) {
  if (!url || !url.includes('cdn.discordapp.com')) return false;
  try {
    const parsed = new URL(url);
    const exHex = parsed.searchParams.get('ex');
    if (!exHex) return false;
    const expiresAt = parseInt(exHex, 16) * 1000;
    // Consider expired if less than 60 minutes remaining
    return Date.now() >= (expiresAt - 60 * 60 * 1000);
  } catch (e) {
    return false;
  }
}

// Refreshed links stay valid for about a day, so remember them instead of asking Discord again on every page of clips.
const REMEMBER_MS = 6 * 60 * 60 * 1000;
const remembered = new Map(); // original url -> { url, at }

async function refreshAttachmentUrls(botToken, urls) {
  if (!urls || urls.length === 0 || !botToken) return {};

  const now = Date.now();
  const refreshedMap = {};
  const expiredUrls = [];
  for (const url of new Set(urls.filter(isUrlExpired))) {
    const known = remembered.get(url);
    if (known && now - known.at < REMEMBER_MS) refreshedMap[url] = known.url;
    else expiredUrls.push(url);
  }
  if (expiredUrls.length === 0) {
    return refreshedMap;
  }

  const BATCH_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < expiredUrls.length; i += BATCH_SIZE) {
    chunks.push(expiredUrls.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const response = await fetch('https://discord.com/api/v10/attachments/refresh-urls', {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ attachment_urls: chunk }),
          signal: AbortSignal.timeout(8000) // a stuck Discord call must not hold the page open
        });

        if (!response.ok) {
          console.error('[CDN Refresher] Failed to refresh URL batch:', response.status, await response.text());
          return;
        }

        const data = await response.json();
        if (data.refreshed_urls) {
          for (const item of data.refreshed_urls) {
            if (item.original && item.refreshed) {
              refreshedMap[item.original] = item.refreshed;
              remembered.set(item.original, { url: item.refreshed, at: now });
            }
          }
        }
      } catch (err) {
        console.error('[CDN Refresher] Error refreshing chunk:', err.message);
      }
    })
  );

  return refreshedMap;
}

module.exports = {
  isUrlExpired,
  refreshAttachmentUrls
};
