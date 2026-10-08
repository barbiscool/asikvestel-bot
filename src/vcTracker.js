const { addVoiceSeconds } = require('./db');
const config = require('./config');

const TRACKED_GUILDS = (config.GUILD_IDS && config.GUILD_IDS.length > 0)
  ? config.GUILD_IDS
  : [config.AUTH_GUILD_ID, config.AV2_GUILD_ID].filter(Boolean);

// Map of active sessions: key = userId, value = { guildId, channelId, joinedAt }
const activeVoiceSessions = new Map();

function isTrackedGuild(guildId) {
  return TRACKED_GUILDS.includes(guildId);
}

function isAfkChannel(voiceState) {
  return voiceState.channelId && voiceState.guild && voiceState.guild.afkChannelId === voiceState.channelId;
}

function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user?.bot) return;

  const guild = newState.guild || oldState.guild;
  if (!guild || !isTrackedGuild(guild.id)) return;

  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  const oldIsAfk = isAfkChannel(oldState);
  const newIsAfk = isAfkChannel(newState);

  const wasInActiveVc = oldChannelId && !oldIsAfk;
  const isInActiveVc = newChannelId && !newIsAfk;

  // Case 1: Joined VC from disconnect or from AFK
  if (!wasInActiveVc && isInActiveVc) {
    activeVoiceSessions.set(userId, {
      guildId: guild.id,
      channelId: newChannelId,
      joinedAt: Date.now()
    });
    return;
  }

  // Case 2: Left VC or moved to AFK
  if (wasInActiveVc && !isInActiveVc) {
    const session = activeVoiceSessions.get(userId);
    if (session) {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - session.joinedAt) / 1000));
      addVoiceSeconds(elapsedSeconds);
      activeVoiceSessions.delete(userId);
    }
    return;
  }

  // Case 3: Switched channels between normal VCs
  if (wasInActiveVc && isInActiveVc && oldChannelId !== newChannelId) {
    const session = activeVoiceSessions.get(userId);
    if (session) {
      session.channelId = newChannelId;
    } else {
      activeVoiceSessions.set(userId, {
        guildId: guild.id,
        channelId: newChannelId,
        joinedAt: Date.now()
      });
    }
  }
}

function scanActiveVoiceMembers(client) {
  if (!client || !client.guilds) return;
  const now = Date.now();

  for (const guildId of TRACKED_GUILDS) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    guild.channels.cache.forEach(channel => {
      if (channel.isVoiceBased() && channel.id !== guild.afkChannelId) {
        channel.members.forEach(member => {
          if (!member.user.bot && !activeVoiceSessions.has(member.id)) {
            activeVoiceSessions.set(member.id, {
              guildId: guild.id,
              channelId: channel.id,
              joinedAt: now
            });
          }
        });
      }
    });
  }
}

function flushActiveVoiceSessions() {
  const now = Date.now();
  let totalFlushedSeconds = 0;

  for (const [userId, session] of activeVoiceSessions.entries()) {
    const elapsedSeconds = Math.max(0, Math.floor((now - session.joinedAt) / 1000));
    if (elapsedSeconds > 0) {
      addVoiceSeconds(elapsedSeconds);
      session.joinedAt = now;
      totalFlushedSeconds += elapsedSeconds;
    }
  }

  return totalFlushedSeconds;
}

function getInFlightSeconds() {
  const now = Date.now();
  let inFlight = 0;
  for (const session of activeVoiceSessions.values()) {
    inFlight += Math.max(0, Math.floor((now - session.joinedAt) / 1000));
  }
  return inFlight;
}

function initVoiceTracker(client) {
  if (!client) return;

  if (client.isReady && client.isReady()) {
    scanActiveVoiceMembers(client);
  } else {
    client.once('ready', () => {
      scanActiveVoiceMembers(client);
    });
  }

  client.on('voiceStateUpdate', (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState);
  });
}

module.exports = {
  TRACKED_GUILDS,
  activeVoiceSessions,
  handleVoiceStateUpdate,
  scanActiveVoiceMembers,
  flushActiveVoiceSessions,
  getInFlightSeconds,
  initVoiceTracker
};
