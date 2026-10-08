const { ActivityType } = require('discord.js');
const defaultDb = require('./db');
const config = require('./config');

// In-memory store for currently playing Spotify tracks detected via Discord presence
// Map<discord_id, SpotifyLiveObject>
const presenceLiveStore = new Map();
let cacheInvalidator = null;
let trackerClient = null;

function setCacheInvalidator(fn) {
  cacheInvalidator = fn;
}

function parseSpotifyPresence(presence) {
  if (!presence || !presence.activities) return null;

  const activity = presence.activities.find(a => 
    (a.name && a.name.toLowerCase() === 'spotify') ||
    (a.type === ActivityType.Listening && a.name && a.name.toLowerCase() === 'spotify') ||
    (a.party?.id && String(a.party.id).startsWith('spotify:'))
  );

  if (!activity) return null;

  const discordId = presence.userId;
  const member = presence.member;
  const user = member?.user || presence.user || (presence.client?.users?.cache?.get(discordId));
  const username = user?.username || '';
  const displayName = member?.displayName || user?.displayName || username || 'Member';
  const avatarUrl = member?.user?.displayAvatarURL 
    ? member.user.displayAvatarURL({ extension: 'png', size: 128 })
    : (user?.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null);

  let albumArtUrl = null;
  if (activity.assets?.largeImage) {
    const rawImg = activity.assets.largeImage;
    if (rawImg.startsWith('spotify:')) {
      albumArtUrl = `https://i.scdn.co/image/${rawImg.slice(8)}`;
    } else if (rawImg.startsWith('http://') || rawImg.startsWith('https://')) {
      albumArtUrl = rawImg;
    } else {
      albumArtUrl = `https://i.scdn.co/image/${rawImg}`;
    }
  }

  const trackId = activity.syncId || null;
  const trackUrl = trackId ? `https://open.spotify.com/track/${trackId}` : null;
  const startMs = activity.timestamps?.start ? new Date(activity.timestamps.start).getTime() : Date.now();
  const endMs = activity.timestamps?.end ? new Date(activity.timestamps.end).getTime() : 0;
  const durationMs = (endMs && startMs && endMs > startMs) ? (endMs - startMs) : 0;
  const progressMs = Math.max(0, Date.now() - startMs);

  return {
    discord_id: discordId,
    discord_username: username,
    discord_display_name: displayName,
    nickname: displayName,
    avatar_url: avatarUrl,
    spotify_profile_url: null,
    is_playing: true,
    track_id: trackId || `presence_${discordId}`,
    track_name: activity.details || 'Unknown Track',
    artist_name: activity.state || 'Unknown Artist',
    album_name: activity.assets?.largeText || '',
    album_art_url: albumArtUrl,
    track_url: trackUrl,
    progress_ms: progressMs,
    duration_ms: durationMs,
    started_at: startMs,
    last_updated: Date.now()
  };
}

function handlePresenceUpdate(oldPresence, newPresence, db = defaultDb) {
  const discordId = newPresence?.userId || oldPresence?.userId;
  if (!discordId) return;

  // Multi-guild de-duplication: For members present in the primary guild,
  // ignore presence events emitted from secondary guilds to eliminate event collision/flapping.
  const primaryGuildId = config.AUTH_GUILD_ID || config.GUILD_ID;
  if (primaryGuildId && newPresence?.guild?.id && newPresence.guild.id !== primaryGuildId) {
    const client = newPresence.client || trackerClient;
    if (client && client.guilds?.cache?.get(primaryGuildId)?.members?.cache?.has(discordId)) {
      return;
    }
  }

  const currentPlaying = parseSpotifyPresence(newPresence);
  const prevPlaying = presenceLiveStore.get(discordId);

  if (currentPlaying) {
    // Record / update Discord username and display name in DB
    if (typeof db.upsertDiscordUser === 'function') {
      db.upsertDiscordUser({
        discord_id: currentPlaying.discord_id,
        username: currentPlaying.discord_username,
        display_name: currentPlaying.discord_display_name,
        avatar_url: currentPlaying.avatar_url
      });
    }

    // Check if song changed from previous
    if (prevPlaying && prevPlaying.track_id !== currentPlaying.track_id) {
      // Scrobble previous track if listened for at least 30 seconds
      const elapsedSec = Math.floor((Date.now() - prevPlaying.started_at) / 1000);
      if (elapsedSec >= 30) {
        try {
          db.insertScrobbles(discordId, [{
            track_id: prevPlaying.track_id,
            track_name: prevPlaying.track_name,
            artist_name: prevPlaying.artist_name,
            album_name: prevPlaying.album_name,
            album_art_url: prevPlaying.album_art_url,
            duration_ms: prevPlaying.duration_ms,
            played_at: Math.floor(prevPlaying.started_at / 1000)
          }]);
          console.log(`[Spotify Presence] Scrobbled track for ${prevPlaying.nickname}: ${prevPlaying.track_name} (${elapsedSec}s)`);
        } catch (e) {
          console.warn('[Spotify Presence] Scrobble error:', e.message);
        }
      }
    }

    presenceLiveStore.set(discordId, currentPlaying);
    if (typeof cacheInvalidator === 'function') {
      cacheInvalidator();
    }
    console.log(`[Spotify Presence] Playing: ${currentPlaying.nickname} (${discordId}) -> ${currentPlaying.track_name} - ${currentPlaying.artist_name}`);
  } else {
    // User stopped or paused playing on Spotify
    if (prevPlaying) {
      const elapsedSec = Math.floor((Date.now() - prevPlaying.started_at) / 1000);
      if (elapsedSec >= 30) {
        try {
          db.insertScrobbles(discordId, [{
            track_id: prevPlaying.track_id,
            track_name: prevPlaying.track_name,
            artist_name: prevPlaying.artist_name,
            album_name: prevPlaying.album_name,
            album_art_url: prevPlaying.album_art_url,
            duration_ms: prevPlaying.duration_ms,
            played_at: Math.floor(prevPlaying.started_at / 1000)
          }]);
          console.log(`[Spotify Presence] Scrobbled track on stop for ${prevPlaying.nickname}: ${prevPlaying.track_name} (${elapsedSec}s)`);
        } catch (e) {
          console.warn('[Spotify Presence] Scrobble error:', e.message);
        }
      }
      presenceLiveStore.delete(discordId);
      if (typeof cacheInvalidator === 'function') {
        cacheInvalidator();
      }
      console.log(`[Spotify Presence] Stopped: User ${discordId} stopped or paused Spotify playback.`);
    }
  }
}

async function scanGuildPresences(client, db = defaultDb) {
  if (!client || !client.guilds) return;
  console.log('[Spotify Presence Tracker] Scanning active guild presences on bot startup...');
  const primaryGuildId = config.AUTH_GUILD_ID || config.GUILD_ID;
  const guilds = Array.from(client.guilds.cache.values()).sort((a, b) => {
    if (a.id === primaryGuildId) return -1;
    if (b.id === primaryGuildId) return 1;
    return 0;
  });

  for (const guild of guilds) {
    try {
      await guild.members.fetch({ withPresences: true });
      const primaryGuild = primaryGuildId ? client.guilds.cache.get(primaryGuildId) : null;

      guild.members.cache.forEach(member => {
        // Multi-guild de-duplication: If member exists in the primary guild and this is a secondary guild, skip
        if (primaryGuildId && guild.id !== primaryGuildId && primaryGuild?.members?.cache?.has(member.id)) {
          return;
        }

        // Upsert guild member into discord_users table so names show on leaderboard
        if (typeof db.upsertDiscordUser === 'function') {
          db.upsertDiscordUser({
            discord_id: member.id,
            username: member.user?.username || '',
            display_name: member.displayName || member.user?.displayName || member.user?.username || '',
            avatar_url: member.user?.displayAvatarURL ? member.user.displayAvatarURL({ extension: 'png', size: 128 }) : ''
          });
        }
        if (member.presence) {
          const live = parseSpotifyPresence(member.presence);
          if (live) {
            presenceLiveStore.set(member.id, live);
            console.log(`[Spotify Presence Startup] Detected active music for ${member.displayName}: ${live.track_name} - ${live.artist_name}`);
          }
        }
      });
    } catch (err) {
      console.warn(`[Spotify Presence Startup] Error fetching members for guild ${guild.id}:`, err.message);
    }
  }
}

function initDiscordSpotifyTracker(client, db = defaultDb) {
  trackerClient = client;
  if (!client) return;

  client.on('presenceUpdate', (oldPresence, newPresence) => {
    handlePresenceUpdate(oldPresence, newPresence, db);
  });

  if (client.isReady && client.isReady()) {
    scanGuildPresences(client, db);
  } else {
    client.once('ready', () => {
      scanGuildPresences(client, db);
    });
  }
}

function getDiscordPresenceLiveList() {
  const now = Date.now();
  const list = [];
  const primaryGuildId = config.AUTH_GUILD_ID || config.GUILD_ID;

  for (const [id, item] of presenceLiveStore.entries()) {
    // If track has a known duration and end time passed, check if still actively listening in Discord cache
    if (item.duration_ms > 0 && item.started_at + item.duration_ms + 30000 < now) {
      let isStillListening = false;
      if (trackerClient && trackerClient.guilds) {
        const primaryGuild = primaryGuildId ? trackerClient.guilds.cache.get(primaryGuildId) : null;
        const targetGuilds = (primaryGuild && primaryGuild.members.cache.has(id))
          ? [primaryGuild]
          : trackerClient.guilds.cache.values();

        for (const guild of targetGuilds) {
          const member = guild.members.cache.get(id);
          if (member?.presence) {
            const live = parseSpotifyPresence(member.presence);
            if (live) {
              isStillListening = true;
              item.track_id = live.track_id;
              item.track_name = live.track_name;
              item.artist_name = live.artist_name;
              item.album_name = live.album_name;
              item.album_art_url = live.album_art_url;
              item.track_url = live.track_url;
              item.started_at = live.started_at;
              item.duration_ms = live.duration_ms;
              break;
            }
          }
        }
      }
      if (!isStillListening) {
        presenceLiveStore.delete(id);
        continue;
      }
    }
    const elapsed = Math.max(0, now - item.started_at);
    const currentProgress = item.duration_ms > 0 ? Math.min(item.duration_ms, elapsed) : elapsed;
    list.push({
      ...item,
      progress_ms: currentProgress
    });
  }
  return list;
}

function isUserPausedInDiscordPresence(discordId) {
  return !presenceLiveStore.has(discordId);
}

function getBotClient() {
  return trackerClient;
}

module.exports = {
  initDiscordSpotifyTracker,
  getDiscordPresenceLiveList,
  handlePresenceUpdate,
  parseSpotifyPresence,
  presenceLiveStore,
  isUserPausedInDiscordPresence,
  setCacheInvalidator,
  getBotClient
};
