const { extractMedia, detectCategory, detectGameAndCategory } = require('./parser');
const { insertClip } = require('./db');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runThrottledBackfill(channel, maxMessages = 200) {
  let scanned = 0;
  let added = 0;
  let lastId = null;

  console.log(`[Backfill] Starting throttled backfill for channel #${channel.name || channel.id}, max: ${maxMessages}`);

  while (scanned < maxMessages) {
    const fetchLimit = Math.min(50, maxMessages - scanned);
    const options = { limit: fetchLimit };
    if (lastId) options.before = lastId;

    let messages;
    try {
      messages = await channel.messages.fetch(options);
    } catch (err) {
      if (err.status === 429) {
        const retryAfter = (err.retryAfter || 5) * 1000;
        console.warn(`[Backfill] Rate limit hit. Sleeping for ${retryAfter}ms`);
        await sleep(retryAfter + 1000);
        continue;
      }
      console.error('[Backfill] Fetch error:', err.message);
      break;
    }

    if (!messages || messages.size === 0) break;

    for (const msg of messages.values()) {
      scanned++;
      lastId = msg.id;

      // Ignore bots
      if (msg.author.bot) continue;

      // Strictly ignore non-video messages
      const media = extractMedia(msg);
      if (!media.isVideo) continue;

      const { category, gameName } = detectGameAndCategory(msg.content);
      const res = insertClip({
        message_id: msg.id,
        channel_id: msg.channelId,
        author_id: msg.author.id,
        author_name: msg.member ? msg.member.displayName : msg.author.username,
        author_avatar: msg.author.displayAvatarURL ? msg.author.displayAvatarURL({ dynamic: true }) : '',
        category: category,
        game_name: gameName,
        caption: msg.content || '',
        media_type: media.mediaType,
        media_url: media.url,
        attachment_id: media.attachmentId,
        message_url: msg.url,
        created_at: msg.createdTimestamp
      });

      if (res && res.changes > 0) added++;
    }

    // Enforce 1.5 to 2.5 second sleep between pagination calls (strictly avoid rate limit)
    const throttleMs = 1500 + Math.floor(Math.random() * 1000);
    console.log(`[Backfill] Batch complete (${scanned}/${maxMessages}). Throttling for ${throttleMs}ms...`);
    await sleep(throttleMs);
  }

  console.log(`[Backfill] Complete! Scanned: ${scanned}, Added clips: ${added}`);
  return { scanned, added };
}

module.exports = { runThrottledBackfill };
