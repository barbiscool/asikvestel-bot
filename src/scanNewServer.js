const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const config = require('./config');
const { extractMedia, detectGameAndCategory } = require('./parser');
const { insertClip } = require('./db');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TARGET_CHANNELS = (config.SCAN_NEW_SERVER_CHANNEL_IDS && config.SCAN_NEW_SERVER_CHANNEL_IDS.length > 0)
  ? config.SCAN_NEW_SERVER_CHANNEL_IDS
  : [
      '1072955073421901834', // 1st: kanalistanbul
      '1210949927702757447', // 2nd: foto-video
      '1200902533573513307'  // 3rd: anayasa
    ];

const MAX_MESSAGES_PER_CHANNEL = 10000;

async function scanChannel(channel, maxMessages = 10000) {
  let scanned = 0;
  let added = 0;
  let lastId = null;

  console.log(`\n======================================================`);
  console.log(`[ChannelScan] Starting scan for #${channel.name} (ID: ${channel.id})`);
  console.log(`[ChannelScan] Target: up to ${maxMessages} messages | STRICT: Files only, no text-only messages.`);
  console.log(`======================================================`);

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
        console.warn(`[ChannelScan] Discord rate limit encountered. Backing off for ${retryAfter + 2000}ms...`);
        await sleep(retryAfter + 2000);
        continue;
      }
      console.error(`[ChannelScan] Fetch error in #${channel.name}:`, err.message);
      break;
    }

    if (!messages || messages.size === 0) {
      console.log(`[ChannelScan] Reached the beginning of #${channel.name} history.`);
      break;
    }

    for (const msg of messages.values()) {
      scanned++;
      lastId = msg.id;

      if (msg.author.bot) continue;

      // STRICT USER RULE: Only scan messages with files attached; ignore text-only messages completely
      if (!msg.attachments || msg.attachments.size === 0) {
        continue;
      }

      const media = extractMedia(msg);
      if (!media.isVideo) {
        continue;
      }

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

      if (res && res.changes > 0) {
        added++;
        console.log(`[ChannelScan] Added clip [${category} / ${gameName || 'N/A'}] from #${channel.name} (msg: ${msg.id})`);
      }
    }

    if (scanned % 500 === 0 || scanned >= maxMessages) {
      console.log(`[ChannelScan] #${channel.name} progress: ${scanned}/${maxMessages} messages scanned, ${added} clips added.`);
    }

    // Gentle pacing to avoid 429 rate limit
    const throttleMs = 1500 + Math.floor(Math.random() * 1000);
    await sleep(throttleMs);
  }

  console.log(`[ChannelScan] Completed #${channel.name}! Total Scanned: ${scanned}, Total New Clips Added: ${added}`);
  return { scanned, added };
}

async function runSequentialScan() {
  if (!config.BOT_TOKEN) {
    console.error('[ChannelScan] BOT_TOKEN missing in config.');
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel]
  });

  client.once('ready', async () => {
    console.log(`[ChannelScan] Logged in as ${client.user.tag}`);
    console.log(`[ChannelScan] Scheduled channels in strict order: ${TARGET_CHANNELS.join(' -> ')}`);

    let totalScanned = 0;
    let totalAdded = 0;

    for (let i = 0; i < TARGET_CHANNELS.length; i++) {
      const channelId = TARGET_CHANNELS[i];
      console.log(`\n[ChannelScan] Starting step ${i + 1}/${TARGET_CHANNELS.length}: Channel ${channelId}`);

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
          console.warn(`[ChannelScan] Channel ${channelId} could not be found or fetched. Skipping.`);
          continue;
        }

        const result = await scanChannel(channel, MAX_MESSAGES_PER_CHANNEL);
        totalScanned += result.scanned;
        totalAdded += result.added;
      } catch (err) {
        console.error(`[ChannelScan] Could not access channel ${channelId}:`, err.message);
      }

      if (i < TARGET_CHANNELS.length - 1) {
        console.log(`[ChannelScan] Resting 5 seconds before next channel to respect Discord rate limits...`);
        await sleep(5000);
      }
    }

    console.log(`\n======================================================`);
    console.log(`[ChannelScan] ALL CHANNELS FINISHED!`);
    console.log(`[ChannelScan] Total messages checked: ${totalScanned}`);
    console.log(`[ChannelScan] Total video clips added: ${totalAdded}`);
    console.log(`======================================================`);

    client.destroy();
    process.exit(0);
  });

  await client.login(config.BOT_TOKEN);
}

if (require.main === module) {
  runSequentialScan().catch(err => {
    console.error('[ChannelScan] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runSequentialScan, scanChannel };
