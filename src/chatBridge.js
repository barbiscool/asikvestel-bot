const { EventEmitter } = require('events');
const { getDiscordUser, getCouncilMembers } = require('./db');

class ChatBridge extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.config = null;
    this.cachedWebhooks = new Map(); // channelId -> { hook, fetchTime }
    this.recentMessagesByChannel = new Map(); // channelId -> array of messages
    this.maxRecentMessages = 20; // Hard cap at 20 messages per channel
    this.userNameCache = new Map(); // userId -> resolved displayName
    this.rateLimitMap = new Map(); // userId -> lastTimestamp
    this.RATE_LIMIT_MS = 1500; // 1.5 seconds between messages per user
    this.sseClients = new Set();
    this.memberCache = new Map(); // userId -> { isMember: boolean, timestamp: number }
  }

  init(client, config) {
    this.client = client;
    this.config = config;
  }

  getChannels() {
    if (this.config?.CHAT_CHANNELS) {
      return this.config.CHAT_CHANNELS;
    }
    const istanbulId = this.config?.CHAT_CHANNEL_ISTANBUL_ID || this.config?.DEFAULT_CHAT_CHANNEL_ID || '1072955073421901834';
    const ankaraId = this.config?.CHAT_CHANNEL_ANKARA_ID || '1389232968140062823';
    const av1Guild = this.config?.AV2_GUILD_ID || '1061058726137692332';
    const av2Guild = this.config?.AUTH_GUILD_ID || '1389232967271972914';

    return {
      [istanbulId]: {
        id: istanbulId,
        name: 'kanalistanbul',
        guildId: av1Guild,
        guildName: 'Aşık Vestel',
        description: 'Aşık Vestel Ana Sohbet Kanalı'
      },
      [ankaraId]: {
        id: ankaraId,
        name: 'kanalankara',
        guildId: av2Guild,
        guildName: 'Aşık Vestel 2.0',
        description: 'Aşık Vestel 2.0 Sohbet Kanalı'
      }
    };
  }

  getDefaultChannelId() {
    return this.config?.DEFAULT_CHAT_CHANNEL_ID || '1072955073421901834';
  }

  getTargetChannelId() {
    return this.getDefaultChannelId();
  }

  isChannelSupported(channelId) {
    const channels = this.getChannels();
    return !!channels[channelId];
  }

  getRecentMessagesList(channelId) {
    const id = channelId || this.getDefaultChannelId();
    if (!this.recentMessagesByChannel.has(id)) {
      this.recentMessagesByChannel.set(id, []);
    }
    return this.recentMessagesByChannel.get(id);
  }

  /**
   * Checks whether a Discord user is an active member of either Aşık Vestel guild:
   * Aşık Vestel 2.0 (1389232967271972914) or Aşık Vestel (1061058726137692332).
   * Strictly enforces access so only verified community members can view or participate.
   * @param {string} userId - Discord user snowflake ID
   * @returns {Promise<boolean>}
   */
  async isUserInAv2(userId) {
    if (!userId) return false;

    // 1. Root admin bypass: barb always has full access
    const adminId = this.config?.ADMIN_DISCORD_USER_ID || '735152588801966132';
    if (userId === adminId) {
      return true;
    }

    // 2. Unit testing or programmatic override hook
    if (typeof this._isMemberOverride === 'function') {
      return this._isMemberOverride(userId);
    }

    // 3. Check in-memory short-term verification cache (2-minute TTL)
    const now = Date.now();
    const cached = this.memberCache?.get(userId);
    if (cached && (now - cached.timestamp < 120000)) {
      return cached.isMember;
    }

    const trackedGuilds = [
      this.config?.AUTH_GUILD_ID || '1389232967271972914',
      this.config?.AV2_GUILD_ID || '1061058726137692332'
    ];

    // 4. Live Discord Bot Client Verification across tracked guilds
    if (this.client && typeof this.client.isReady === 'function' && this.client.isReady()) {
      try {
        for (const guildId of trackedGuilds) {
          const guild = this.client.guilds.cache.get(guildId);
          if (guild) {
            // Check cached members
            if (guild.members.cache.has(userId)) {
              if (!this.memberCache) this.memberCache = new Map();
              this.memberCache.set(userId, { isMember: true, timestamp: now });
              return true;
            }

            // Fetch member from Discord API
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
              if (!this.memberCache) this.memberCache = new Map();
              this.memberCache.set(userId, { isMember: true, timestamp: now });
              return true;
            }
          }
        }
      } catch (err) {
        console.error('[ChatBridge] Guild member verification error:', err.message);
      }
    }

    if (!this.memberCache) this.memberCache = new Map();
    this.memberCache.set(userId, { isMember: false, timestamp: now });
    return false;
  }

  /**
   * Retrieves or creates a dedicated Webhook for sending messages to the target channel.
   * Handles multi-channel caching, re-fetching, and error recovery.
   */
  async getOrCreateWebhook(channelId = null) {
    const targetId = channelId || this.getDefaultChannelId();
    if (!this.client || !this.client.isReady()) {
      throw new Error('Discord bot istemcisi henüz hazır değil.');
    }

    const now = Date.now();
    const cached = this.cachedWebhooks.get(targetId);
    if (cached && (now - cached.fetchTime < 600000)) {
      return cached.hook;
    }

    const channel = await this.client.channels.fetch(targetId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Hedef metin kanalı (${targetId}) bulunamadı veya erişilemiyor.`);
    }

    const webhooks = await channel.fetchWebhooks().catch(err => {
      console.error(`[ChatBridge] Webhook listeleme hatası (${targetId}):`, err.message);
      return null;
    });

    let hook = webhooks ? webhooks.find(w => w.name === 'AsikVestel-WebBridge' || (w.owner && w.owner.id === this.client.user?.id)) : null;

    if (!hook) {
      console.log(`[ChatBridge] #${channel.name} (${targetId}) kanalında yeni AsikVestel-WebBridge webhook'u oluşturuluyor...`);
      hook = await channel.createWebhook({
        name: 'AsikVestel-WebBridge',
        avatar: this.client.user?.displayAvatarURL ? this.client.user.displayAvatarURL() : null,
        reason: 'Aşık Vestel Web-to-Discord Canlı Sohbet Köprüsü'
      });
    }

    this.cachedWebhooks.set(targetId, { hook, fetchTime: now });
    return hook;
  }

  /**
   * Resolves Discord mention tags (<@123>, <@!123>, <#123>, <@&123>) to readable names.
   * Leverages message mentions, guild member cache, client user cache, SQLite DB, and known Council mapping.
   */
  resolveMentions(rawContent, msg = null) {
    if (!rawContent || typeof rawContent !== 'string') return '';
    let content = rawContent;

    // 1. User mentions: <@123456789> or <@!123456789>
    content = content.replace(/<@!?(\d+)>/g, (match, userId) => {
      let name = null;
      // Check message mentions
      if (msg?.mentions?.members?.has(userId)) {
        name = msg.mentions.members.get(userId).displayName;
      } else if (msg?.mentions?.users?.has(userId)) {
        const u = msg.mentions.users.get(userId);
        name = u.globalName || u.username;
      } else if (msg?.guild?.members?.cache?.has(userId)) {
        name = msg.guild.members.cache.get(userId).displayName;
      } else if (this.client?.users?.cache?.has(userId)) {
        const u = this.client.users.cache.get(userId);
        name = u.globalName || u.username;
      } else if (this.userNameCache?.has(userId)) {
        name = this.userNameCache.get(userId);
      } else {
        const dbUser = getDiscordUser(userId);
        if (dbUser) {
          name = dbUser.display_name || dbUser.username;
        }
      }

      // Resolve from SQLite council members, admin config, or config.KNOWN_MEMBERS
      if (!name) {
        try {
          const council = getCouncilMembers();
          if (Array.isArray(council)) {
            const member = council.find(c => String(c.id) === String(userId));
            if (member) {
              name = member.name || (member.handle ? member.handle.replace('@', '') : null);
            }
          }
        } catch (_) {}
      }

      if (!name) {
        const adminId = this.config?.ADMIN_DISCORD_USER_ID || '735152588801966132';
        if (userId === adminId) {
          name = this.config?.ADMIN_USERNAME || 'barb';
        }
      }

      if (!name && this.config?.KNOWN_MEMBERS && typeof this.config.KNOWN_MEMBERS === 'object') {
        name = this.config.KNOWN_MEMBERS[userId];
      }

      if (name) {
        if (!this.userNameCache) this.userNameCache = new Map();
        this.userNameCache.set(userId, name);
        return `@${name}`;
      }
      return match;
    });

    // 2. Channel mentions: <#123456789>
    content = content.replace(/<#(\d+)>/g, (match, channelId) => {
      const ch = this.client?.channels?.cache?.get(channelId);
      if (ch) return `#${ch.name}`;
      const channels = this.getChannels();
      if (channels[channelId]) return `#${channels[channelId].name}`;
      return match;
    });

    // 3. Role mentions: <@&123456789>
    content = content.replace(/<@&(\d+)>/g, (match, roleId) => {
      const r = msg?.guild?.roles?.cache?.get(roleId);
      return r ? `@${r.name}` : match;
    });

    return content;
  }

  /**
   * Formats a Discord.js Message instance into a clean JSON structure for the Web UI.
   */
  formatDiscordMessage(msg) {
    if (!msg) return null;

    const author = msg.author || {};
    const member = msg.member || {};

    let avatarUrl = '';
    if (typeof author.displayAvatarURL === 'function') {
      avatarUrl = author.displayAvatarURL({ dynamic: true, size: 128 });
    } else if (author.avatar) {
      avatarUrl = `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`;
    } else {
      avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }

    const attachments = (msg.attachments && typeof msg.attachments.values === 'function')
      ? Array.from(msg.attachments.values()).map(a => ({
          id: a.id,
          url: a.url,
          name: a.name || 'dosya',
          contentType: a.contentType || '',
          isImage: (a.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || '')
        }))
      : (Array.isArray(msg.attachments) ? msg.attachments : []);

    const embeds = (msg.embeds && Array.isArray(msg.embeds))
      ? msg.embeds.map(e => ({
          type: e.type || e.data?.type || 'link',
          url: e.url || e.data?.url || null,
          image: e.image?.url || e.data?.image?.url || null,
          thumbnail: e.thumbnail?.url || e.data?.thumbnail?.url || null,
          video: e.video?.url || e.data?.video?.url || null
        })).filter(e => e.image || e.thumbnail || e.video || e.url)
      : [];

    const stickers = (msg.stickers && typeof msg.stickers.values === 'function')
      ? Array.from(msg.stickers.values()).map(s => {
          const ext = s.formatType === 4 ? 'gif' : 'png';
          const fallbackUrl = `https://media.discordapp.net/stickers/${s.id}.${ext}?size=160`;
          return {
            id: s.id,
            name: s.name || 'Sticker',
            formatType: s.formatType,
            url: s.url || fallbackUrl
          };
        })
      : (Array.isArray(msg.stickers) ? msg.stickers.map(s => {
          const ext = s.formatType === 4 ? 'gif' : 'png';
          const fallbackUrl = `https://media.discordapp.net/stickers/${s.id}.${ext}?size=160`;
          return {
            id: s.id,
            name: s.name || 'Sticker',
            formatType: s.formatType,
            url: s.url || fallbackUrl
          };
        }) : []);

    const resolvedContent = this.resolveMentions(msg.content || '', msg);
    const replyTo = this.resolveReplyInfo(msg);

    return {
      id: msg.id,
      channelId: msg.channelId,
      content: resolvedContent,
      rawContent: msg.content || '',
      author: {
        id: author.id,
        username: author.username || 'Discord Kullanıcısı',
        displayName: member.displayName || author.displayName || author.username || 'Discord Kullanıcısı',
        avatarUrl: avatarUrl,
        isBot: !!author.bot,
        isWebhook: !!msg.webhookId
      },
      attachments: attachments,
      embeds: embeds,
      stickers: stickers,
      replyTo: replyTo,
      createdAt: msg.createdTimestamp || Date.now()
    };
  }

  /**
   * Resolves reply/reference metadata if a message is an inline reply.
   */
  resolveReplyInfo(msg) {
    if (!msg) return null;

    const ref = msg.reference || msg.message_reference;
    if (!ref) return null;

    const refMessageId = ref.messageId || ref.message_id;
    if (!refMessageId) return null;

    // 1. Check Discord.js channel message cache
    let referencedMsg = null;
    if (msg.channel?.messages?.cache && typeof msg.channel.messages.cache.get === 'function') {
      referencedMsg = msg.channel.messages.cache.get(refMessageId);
    }

    // 2. Check local in-memory channel ringBuffer
    if (!referencedMsg && msg.channelId) {
      const ringBuffer = this.getRecentMessagesList(msg.channelId);
      const found = ringBuffer?.find(m => m.id === refMessageId);
      if (found) {
        return {
          id: found.id,
          authorName: found.author?.displayName || found.author?.username || 'Discord Kullanıcısı',
          authorAvatar: found.author?.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
          content: found.content || (found.stickers?.length ? '[Çıkartma]' : (found.attachments?.length ? '[Medya/Görsel]' : 'Mesaj')),
          isMedia: !found.content && ((found.stickers && found.stickers.length > 0) || (found.attachments && found.attachments.length > 0))
        };
      }
    }

    // 3. If referencedMsg was found in channel cache
    if (referencedMsg) {
      const author = referencedMsg.author || {};
      const member = referencedMsg.member || {};
      const authorName = member.displayName || author.displayName || author.globalName || author.username || 'Discord Kullanıcısı';
      let avatarUrl = '';
      if (typeof author.displayAvatarURL === 'function') {
        avatarUrl = author.displayAvatarURL({ dynamic: true, size: 64 });
      } else if (author.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`;
      } else {
        avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      }

      let contentSnippet = (referencedMsg.content || '').slice(0, 120);
      const hasMedia = (referencedMsg.attachments?.size > 0 || referencedMsg.attachments?.length > 0) ||
                       (referencedMsg.stickers?.size > 0 || referencedMsg.stickers?.length > 0) ||
                       (referencedMsg.embeds?.length > 0);
      if (!contentSnippet && hasMedia) {
        if (referencedMsg.stickers?.size > 0 || referencedMsg.stickers?.length > 0) {
          contentSnippet = '[Çıkartma]';
        } else {
          contentSnippet = '[Görsel / Medya]';
        }
      }

      return {
        id: refMessageId,
        authorName: authorName,
        authorAvatar: avatarUrl,
        content: contentSnippet || 'Orijinal mesaj',
        isMedia: !referencedMsg.content && hasMedia
      };
    }

    // 4. Fallback to msg.mentions.repliedUser
    const repliedUser = msg.mentions?.repliedUser;
    if (repliedUser) {
      const authorName = repliedUser.displayName || repliedUser.globalName || repliedUser.username || 'Discord Kullanıcısı';
      let avatarUrl = '';
      if (typeof repliedUser.displayAvatarURL === 'function') {
        avatarUrl = repliedUser.displayAvatarURL({ dynamic: true, size: 64 });
      } else if (repliedUser.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${repliedUser.id}/${repliedUser.avatar}.png`;
      } else {
        avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      }

      return {
        id: refMessageId,
        authorName: authorName,
        authorAvatar: avatarUrl,
        content: 'Orijinal mesaj',
        isMedia: false
      };
    }

    // 5. Minimal fallback
    return {
      id: refMessageId,
      authorName: 'Discord Kullanıcısı',
      authorAvatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
      content: 'Mesaja yanıt verildi',
      isMedia: false
    };
  }

  /**
   * Fetches recent messages from a Discord channel, updating in-memory ring buffer.
   * Strictly caps at 20 messages, immediately offloading older records from RAM.
   * Refreshes channel message cache on demand when the page is accessed.
   */
  async fetchRecentMessages(channelId = null, limit = 20) {
    const targetId = channelId || this.getDefaultChannelId();
    const ringBuffer = this.getRecentMessagesList(targetId);
    const fetchLimit = Math.min(parseInt(limit, 10) || 20, this.maxRecentMessages);

    if (!this.client || !this.client.isReady()) {
      return ringBuffer.slice(-fetchLimit);
    }

    try {
      const channel = await this.client.channels.fetch(targetId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return ringBuffer.slice(-fetchLimit);
      }

      const rawMessages = await channel.messages.fetch({ limit: fetchLimit });
      const formatted = Array.from(rawMessages.values())
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(m => this.formatDiscordMessage(m))
        .filter(Boolean);

      // On page access, refresh channel ring buffer with latest messages (strictly capped at 20)
      ringBuffer.length = 0;
      ringBuffer.push(...formatted.slice(-this.maxRecentMessages));

      return ringBuffer.slice(-fetchLimit);
    } catch (err) {
      console.warn(`[ChatBridge] Mesaj geçmişi çekilirken uyarı (${targetId}):`, err.message);
      return ringBuffer.slice(-fetchLimit);
    }
  }

  /**
   * Receives incoming messages from bot's messageCreate event.
   * Immediately offloads records older than 50 messages from memory.
   */
  handleIncomingMessage(msg) {
    if (!msg || !this.isChannelSupported(msg.channelId)) {
      return;
    }

    const formatted = this.formatDiscordMessage(msg);
    if (!formatted) return;

    const ringBuffer = this.getRecentMessagesList(msg.channelId);

    // Check if already in cache
    if (!ringBuffer.some(m => m.id === formatted.id)) {
      ringBuffer.push(formatted);
      if (ringBuffer.length > this.maxRecentMessages) {
        ringBuffer.splice(0, ringBuffer.length - this.maxRecentMessages);
      }
    }

    // Broadcast to SSE clients
    this.broadcastToSse(formatted);
    this.emit('message', formatted);

    // If configured to relay to external Web API
    const webApiUrl = this.config?.WEB_API_URL || process.env.WEB_API_URL;
    if (webApiUrl && typeof fetch === 'function') {
      const secret = this.config?.CHAT_BRIDGE_INTERNAL_SECRET || this.config?.SESSION_SECRET || process.env.CHAT_BRIDGE_INTERNAL_SECRET;
      fetch(`${webApiUrl.replace(/\/$/, '')}/api/chat/internal/incoming`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret || ''
        },
        body: JSON.stringify({ message: formatted })
      }).catch(err => {
        // Silently log failure without crashing
        // console.warn('[ChatBridge] Web API relay warning:', err.message);
      });
    }
  }

  /**
   * Sends a message to Discord via webhook using the authenticated user's identity.
   */
  async sendWebUserMessage(user, rawContent, channelId = null) {
    if (!user || !user.id) {
      return { success: false, status: 401, error: 'Oturum açılmamış veya kullanıcı geçersiz.' };
    }

    const targetChannelId = channelId || this.getDefaultChannelId();
    if (!this.isChannelSupported(targetChannelId)) {
      return { success: false, status: 400, error: 'Geçersiz veya desteklenmeyen sohbet kanalı.' };
    }

    // Input validation & sanitization (api-security-best-practices & backend-security-coder)
    if (typeof rawContent !== 'string') {
      return { success: false, status: 400, error: 'Geçersiz mesaj formatı.' };
    }

    const content = rawContent.trim();
    if (!content) {
      return { success: false, status: 400, error: 'Boş mesaj gönderilemez.' };
    }

    if (content.length > 2000) {
      return { success: false, status: 400, error: 'Mesaj en fazla 2000 karakter olabilir.' };
    }

    // Rate-limiting per user (backend-security-coder)
    const now = Date.now();
    const lastSent = this.rateLimitMap.get(user.id) || 0;
    if (now - lastSent < this.RATE_LIMIT_MS) {
      const waitSec = (((this.RATE_LIMIT_MS - (now - lastSent)) / 1000)).toFixed(1);
      return { success: false, status: 429, error: `Çok hızlı mesaj gönderiyorsunuz. Lütfen ${waitSec} sn bekleyin.` };
    }
    this.rateLimitMap.set(user.id, now);

    // Resolve verified avatar & username (auth-implementation-patterns)
    const dbUser = getDiscordUser(user.id);
    let avatarUrl = dbUser?.avatar_url || '';
    if (!avatarUrl && user.avatar) {
      avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    }
    if (!avatarUrl) {
      avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }

    const senderName = dbUser?.display_name || user.displayName || user.username || 'Web Üyesi';

    try {
      const webhook = await this.getOrCreateWebhook(targetChannelId);
      const sentMessage = await webhook.send({
        content: content,
        username: senderName.slice(0, 80), // Discord username limit: 80 chars
        avatarURL: avatarUrl,
        allowedMentions: { parse: ['users'] } // Security: PREVENTS @everyone or @here pings
      });

      const formatted = this.formatDiscordMessage(sentMessage);
      if (formatted) {
        const ringBuffer = this.getRecentMessagesList(targetChannelId);
        if (!ringBuffer.some(m => m.id === formatted.id)) {
          ringBuffer.push(formatted);
          if (ringBuffer.length > this.maxRecentMessages) {
            ringBuffer.splice(0, ringBuffer.length - this.maxRecentMessages);
          }
        }
        this.broadcastToSse(formatted);
      }

      return {
        success: true,
        status: 200,
        message: formatted || { id: sentMessage.id, channelId: targetChannelId, content, senderName }
      };
    } catch (err) {
      console.error(`[ChatBridge] Webhook ile mesaj gönderme hatası (${targetChannelId}):`, err.message);
      // Invalidate cached webhook on 404 or authentication failure
      if (err.status === 404 || err.code === 10015) {
        this.cachedWebhooks.delete(targetChannelId);
      }
      return { success: false, status: 500, error: 'Discord webhook ile mesaj iletilirken hata oluştu.' };
    }
  }

  /**
   * Registers a new Server-Sent Events (SSE) connection.
   */
  addSseClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx
    res.flushHeaders?.();

    // Send initial connected ping
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    this.sseClients.add(res);

    // Heartbeat every 20 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 20000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.sseClients.delete(res);
    });
  }

  broadcastToSse(data) {
    const payload = `data: ${JSON.stringify({ type: 'message', message: data })}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }
}

const chatBridge = new ChatBridge();

module.exports = {
  chatBridge,
  ChatBridge
};
