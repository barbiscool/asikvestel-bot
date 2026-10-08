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

async function refreshAttachmentUrls(botToken, urls) {
  if (!urls || urls.length === 0 || !botToken) return {};

  const expiredUrls = Array.from(new Set(urls.filter(isUrlExpired)));
  if (expiredUrls.length === 0) {
    return {};
  }

  const BATCH_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < expiredUrls.length; i += BATCH_SIZE) {
    chunks.push(expiredUrls.slice(i, i + BATCH_SIZE));
  }

  const refreshedMap = {};

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const response = await fetch('https://discord.com/api/v10/attachments/refresh-urls', {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ attachment_urls: chunk })
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
