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

    // 3. Check in-memory short-term verification cache (30-second TTL)
    const now = Date.now();
    const cached = this.memberCache?.get(userId);
    if (cached && (now - cached.timestamp < 30000)) {
      return cached.isMember;
    }

    // Only the Aşık Vestel server (1389232967271972914) grants access.
    const trackedGuilds = [this.config?.AUTH_GUILD_ID || '1389232967271972914'];

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

    // 5. Decoupled standalone mode: live Discord REST check via BOT_TOKEN
    const botToken = this.config?.BOT_TOKEN || this.config?.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (botToken && typeof fetch === 'function') {
      for (const guildId of trackedGuilds) {
        try {
          const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
            headers: { Authorization: `Bot ${botToken}` }
          });
          if (res.ok) {
            if (!this.memberCache) this.memberCache = new Map();
            this.memberCache.set(userId, { isMember: true, timestamp: now });
            return true;
          }
        } catch (_) {}
      }
    }

    if (!this.memberCache) this.memberCache = new Map();
    this.memberCache.set(userId, { isMember: false, timestamp: now });
    return false;
  }

  _createWebhookAdapter(webhookUrl, targetId) {
    return {
      send: async ({ content, username, avatarURL, allowedMentions }) => {
        const url = webhookUrl + (webhookUrl.includes('?') ? '&' : '?') + 'wait=true';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            username,
            avatar_url: avatarURL,
            allowed_mentions: allowedMentions
          })
        });
        if (!res.ok) {
          throw new Error(`Discord Webhook HTTP ${res.status}`);
        }
        const raw = await res.json();
        return {
          id: raw.id,
          channelId: raw.channel_id || targetId,
          content: raw.content,
          author: {
            id: raw.author?.id,
            username: raw.author?.username || username,
            globalName: raw.author?.global_name || username,
            displayName: username
          },
          createdTimestamp: new Date(raw.timestamp || Date.now()).getTime()
        };
      }
    };
  }

  /**
   * Retrieves or creates a dedicated Webhook for sending messages to the target channel.
   * Handles multi-channel caching, re-fetching, and error recovery.
   */
  async getOrCreateWebhook(channelId = null) {
    const targetId = channelId || this.getDefaultChannelId();
    const now = Date.now();
    const cached = this.cachedWebhooks.get(targetId);
    if (cached && (now - cached.fetchTime < 600000)) {
      return cached.hook;
    }

    // 1. Direct Webhook URL fallback when running standalone without local Discord client
    const envWebhook = this.config?.CHAT_WEBHOOK_URL ||
      process.env.CHAT_WEBHOOK_URL ||
      (this.config && this.config[`CHAT_WEBHOOK_${targetId}`]) ||
      (process.env && process.env[`CHAT_WEBHOOK_${targetId}`]);

    if (envWebhook && typeof fetch === 'function') {
      const hookAdapter = this._createWebhookAdapter(envWebhook, targetId);
      this.cachedWebhooks.set(targetId, { hook: hookAdapter, fetchTime: now });
      return hookAdapter;
    }

    // 2. Connected Discord.js client
    if (this.client && typeof this.client.isReady === 'function' && this.client.isReady()) {
      const channel = await this.client.channels.fetch(targetId).catch(() => null);
      if (channel && channel.isTextBased()) {
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
    }

    // 3. Standalone mode with Bot Token: query or auto-create webhook via Discord REST API
    const botToken = this.config?.BOT_TOKEN || this.config?.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (botToken && typeof fetch === 'function') {
      try {
        const listRes = await fetch(`https://discord.com/api/v10/channels/${targetId}/webhooks`, {
          headers: { Authorization: `Bot ${botToken}` }
        });
        if (listRes.ok) {
          const hooks = await listRes.json();
          let targetHook = Array.isArray(hooks) ? hooks.find(h => h.name === 'AsikVestel-WebBridge' && h.token) : null;
          if (!targetHook && Array.isArray(hooks) && hooks.length > 0) {
            targetHook = hooks.find(h => h.token);
          }

          if (!targetHook) {
            const createRes = await fetch(`https://discord.com/api/v10/channels/${targetId}/webhooks`, {
              method: 'POST',
              headers: {
                Authorization: `Bot ${botToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: 'AsikVestel-WebBridge',
                reason: 'Aşık Vestel Web-to-Discord Canlı Sohbet Köprüsü'
              })
            });
            if (createRes.ok) {
              targetHook = await createRes.json();
            }
          }

          if (targetHook && targetHook.token) {
            const webhookUrl = `https://discord.com/api/webhooks/${targetHook.id}/${targetHook.token}`;
            const hookAdapter = this._createWebhookAdapter(webhookUrl, targetId);
            this.cachedWebhooks.set(targetId, { hook: hookAdapter, fetchTime: now });
            return hookAdapter;
          }
        }
      } catch (err) {
        console.warn(`[ChatBridge] Webhook REST araması uyarısı (${targetId}):`, err.message);
      }

      // 4. Fallback if webhook creation fails: Send message as bot via Discord REST API
      const fallbackBotAdapter = {
        send: async ({ content, username, avatarURL, allowedMentions }) => {
          const res = await fetch(`https://discord.com/api/v10/channels/${targetId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              content: `**[${username || 'Web Üyesi'}]**: ${content}`,
              allowed_mentions: allowedMentions || { parse: ['users'] }
            })
          });
          if (!res.ok) {
            throw new Error(`Discord Bot REST HTTP ${res.status}`);
          }
          const raw = await res.json();
          return {
            id: raw.id,
            channelId: raw.channel_id || targetId,
            content: raw.content,
            author: {
              id: raw.author?.id,
              username: username || raw.author?.username,
              globalName: username,
              displayName: username
            },
            createdTimestamp: new Date(raw.timestamp || Date.now()).getTime()
          };
        }
      };
      return fallbackBotAdapter;
    }

    throw new Error('Discord bot istemcisi veya webhook henüz hazır değil.');
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

  // Only our own output (e.g. relayed by the bot) has a numeric createdAt and author.avatarUrl.
  // Raw Discord REST messages and discord.js Messages (createdAt is a Date) must go through formatting.
  isAlreadyFormatted(msg) {
    return Boolean(
      msg &&
      msg.id &&
      (msg.channelId || msg.channel_id) &&
      typeof msg.createdAt === 'number' &&
      typeof msg.author?.avatarUrl === 'string'
    );
  }

  normalizeFormattedMessage(msg) {
    const channelId = msg.channelId || msg.channel_id;
    const author = msg.author || {};
    return {
      id: msg.id,
      channelId: channelId,
      content: msg.content || '',
      rawContent: msg.rawContent || msg.content || '',
      author: {
        id: author.id,
        username: author.username || 'Discord Kullanıcısı',
        displayName: author.displayName || author.globalName || author.global_name || author.username || 'Discord Kullanıcısı',
        avatarUrl: author.avatarUrl || (author.avatar ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png'),
        isBot: Boolean(author.isBot || author.bot),
        isWebhook: Boolean(author.isWebhook || msg.webhookId || msg.webhook_id)
      },
      attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      embeds: Array.isArray(msg.embeds) ? msg.embeds : [],
      stickers: Array.isArray(msg.stickers) ? msg.stickers : [],
      replyTo: msg.replyTo || null,
      createdAt: Number(msg.createdAt) || (msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now())
    };
  }

  /**
   * Formats a Discord.js Message instance or Discord REST JSON into a clean structure for the Web UI.
   */
  formatDiscordMessage(msg) {
    if (!msg) return null;

    if (this.isAlreadyFormatted(msg)) {
      return this.normalizeFormattedMessage(msg);
    }

    const author = msg.author || {};
    const member = msg.member || {};

    let avatarUrl = '';
    if (typeof author.displayAvatarURL === 'function') {
      avatarUrl = author.displayAvatarURL({ dynamic: true, size: 128 });
    } else if (author.avatar) {
      const isAnimated = typeof author.avatar === 'string' && author.avatar.startsWith('a_');
      avatarUrl = `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${isAnimated ? 'gif' : 'png'}?size=128`;
    } else {
      avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }

    let rawAttachments = [];
    if (msg.attachments && typeof msg.attachments.values === 'function' && !(msg.attachments instanceof Array)) {
      rawAttachments = Array.from(msg.attachments.values());
    } else if (Array.isArray(msg.attachments)) {
      rawAttachments = msg.attachments;
    }

    const attachments = rawAttachments.map(a => {
      const name = a.name || a.filename || 'dosya';
      const contentType = a.contentType || a.content_type || '';
      return {
        id: a.id,
        url: a.url,
        name: name,
        contentType: contentType,
        isImage: contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)
      };
    });

    const embeds = (msg.embeds && Array.isArray(msg.embeds))
      ? msg.embeds.map(e => ({
          type: e.type || e.data?.type || 'link',
          url: e.url || e.data?.url || null,
          image: e.image?.url || e.data?.image?.url || null,
          thumbnail: e.thumbnail?.url || e.data?.thumbnail?.url || null,
          video: e.video?.url || e.data?.video?.url || null
        })).filter(e => e.image || e.thumbnail || e.video || e.url)
      : [];

    let rawStickers = [];
    if (msg.stickers && typeof msg.stickers.values === 'function' && !(msg.stickers instanceof Array)) {
      rawStickers = Array.from(msg.stickers.values());
    } else if (Array.isArray(msg.stickers)) {
      rawStickers = msg.stickers;
    }

    const stickers = rawStickers.map(s => {
      const ext = s.formatType === 4 || s.format_type === 4 ? 'gif' : 'png';
      const fallbackUrl = `https://media.discordapp.net/stickers/${s.id}.${ext}?size=160`;
      return {
        id: s.id,
        name: s.name || 'Sticker',
        formatType: s.formatType || s.format_type || 1,
        url: s.url || fallbackUrl
      };
    });

    const resolvedContent = this.resolveMentions(msg.content || '', msg);
    const replyTo = this.resolveReplyInfo(msg);
    const channelId = msg.channelId || msg.channel_id;
    const createdAt = msg.createdTimestamp || (msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now());

    return {
      id: msg.id,
      channelId: channelId,
      content: resolvedContent,
      rawContent: msg.content || '',
      author: {
        id: author.id,
        username: author.username || 'Discord Kullanıcısı',
        displayName: member.displayName || author.displayName || author.global_name || author.globalName || author.username || 'Discord Kullanıcısı',
        avatarUrl: avatarUrl,
        isBot: Boolean(author.bot || msg.webhookId || msg.webhook_id || author.isBot),
        isWebhook: Boolean(msg.webhookId || msg.webhook_id || author.isWebhook)
      },
      attachments: attachments,
      embeds: embeds,
      stickers: stickers,
      replyTo: replyTo,
      createdAt: createdAt
    };
  }

  /**
   * Resolves reply/reference metadata if a message is an inline reply.
   */
  resolveReplyInfo(msg) {
    if (!msg) return null;
    if (msg.replyTo) return msg.replyTo;

    // Discord REST API embedded referenced_message
    if (msg.referenced_message) {
      const ref = msg.referenced_message;
      const refAuthor = ref.author || {};
      let refAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
      if (refAuthor.avatar) {
        refAvatar = `https://cdn.discordapp.com/avatars/${refAuthor.id}/${refAuthor.avatar}.png?size=64`;
      }
      return {
        id: ref.id,
        authorName: refAuthor.global_name || refAuthor.displayName || refAuthor.username || 'Discord Kullanıcısı',
        authorAvatar: refAvatar,
        content: (ref.content || '').slice(0, 120) || (ref.attachments?.length ? '[Görsel / Medya]' : 'Mesaj'),
        isMedia: !ref.content && ((ref.attachments && ref.attachments.length > 0) || (ref.stickers && ref.stickers.length > 0))
      };
    }

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
    const targetChannelId = msg.channelId || msg.channel_id;
    if (!referencedMsg && targetChannelId) {
      const ringBuffer = this.getRecentMessagesList(targetChannelId);
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

    // 1. Connected Discord.js client
    if (this.client && typeof this.client.isReady === 'function' && this.client.isReady()) {
      try {
        const channel = await this.client.channels.fetch(targetId).catch(() => null);
        if (channel && channel.isTextBased()) {
          const rawMessages = await channel.messages.fetch({ limit: fetchLimit });
          const formatted = Array.from(rawMessages.values())
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
            .map(m => this.formatDiscordMessage(m))
            .filter(Boolean);

          ringBuffer.length = 0;
          ringBuffer.push(...formatted.slice(-this.maxRecentMessages));
          return ringBuffer.slice(-fetchLimit);
        }
      } catch (err) {
        console.warn(`[ChatBridge] Mesaj geçmişi çekilirken uyarı (${targetId}):`, err.message);
      }
    }

    // 2. Standalone REST mode with Bot Token
    const botToken = this.config?.BOT_TOKEN || this.config?.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (botToken && typeof fetch === 'function') {
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${targetId}/messages?limit=${fetchLimit}`, {
          headers: { Authorization: `Bot ${botToken}` }
        });
        if (res.ok) {
          const rawMessages = await res.json();
          if (Array.isArray(rawMessages)) {
            const formatted = rawMessages
              .sort((a, b) => {
                const timeA = a.createdTimestamp || (a.timestamp ? new Date(a.timestamp).getTime() : 0);
                const timeB = b.createdTimestamp || (b.timestamp ? new Date(b.timestamp).getTime() : 0);
                return timeA - timeB;
              })
              .map(m => this.formatDiscordMessage(m))
              .filter(Boolean);

            ringBuffer.length = 0;
            ringBuffer.push(...formatted.slice(-this.maxRecentMessages));
            return ringBuffer.slice(-fetchLimit);
          }
        }
      } catch (err) {
        console.warn(`[ChatBridge] Discord REST mesaj geçmişi çekilirken uyarı (${targetId}):`, err.message);
      }
    }

    return ringBuffer.slice(-fetchLimit);
  }

  /**
   * Receives incoming messages from bot's messageCreate event or internal relay.
   * Immediately offloads records older than 20 messages from memory.
   */
  handleIncomingMessage(msg) {
    if (!msg) return;
    const channelId = msg.channelId || msg.channel_id;
    if (!this.isChannelSupported(channelId)) {
      return;
    }

    const formatted = this.formatDiscordMessage(msg);
    if (!formatted) return;

    const ringBuffer = this.getRecentMessagesList(channelId);

    // The website can get the same message from both REST polling and the bot relay: handle it once.
    if (ringBuffer.some(m => m.id === formatted.id)) return;
    ringBuffer.push(formatted);
    if (ringBuffer.length > this.maxRecentMessages) {
      ringBuffer.splice(0, ringBuffer.length - this.maxRecentMessages);
    }

    // Broadcast to SSE clients
    this.broadcastToSse(formatted);
    this.emit('message', formatted);

    // Bot side only: forward to the website's internal endpoint. The website never sets WEB_API_URL.
    const webApiUrl = this.config?.WEB_API_URL || process.env.WEB_API_URL;
    const secret = this.config?.CHAT_BRIDGE_INTERNAL_SECRET || process.env.CHAT_BRIDGE_INTERNAL_SECRET;
    if (webApiUrl && secret && typeof fetch === 'function') {
      fetch(`${webApiUrl.replace(/\/$/, '')}/api/chat/internal/incoming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ message: formatted })
      }).catch(err => console.warn('[ChatBridge] Web API relay failed:', err.message));
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
    this.startSsePolling();

    // Heartbeat every 20 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 20000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.sseClients.delete(res);
      if (this.sseClients.size === 0) {
        this.stopSsePolling();
      }
    });
  }

  startSsePolling() {
    if (this.ssePollTimer) return;
    const botToken = this.config?.BOT_TOKEN || this.config?.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (!botToken || (this.client && typeof this.client.isReady === 'function' && this.client.isReady())) {
      return;
    }

    this.ssePollTimer = setInterval(async () => {
      if (this.sseClients.size === 0) {
        this.stopSsePolling();
        return;
      }
      const channels = Object.keys(this.getChannels());
      for (const chId of channels) {
        try {
          const ringBuffer = this.getRecentMessagesList(chId);
          const newestMsg = ringBuffer[ringBuffer.length - 1];
          const url = newestMsg?.id
            ? `https://discord.com/api/v10/channels/${chId}/messages?after=${newestMsg.id}&limit=10`
            : `https://discord.com/api/v10/channels/${chId}/messages?limit=5`;

          const res = await fetch(url, {
            headers: { Authorization: `Bot ${botToken}` }
          });
          if (!res.ok) continue;
          const newMsgs = await res.json();
          if (Array.isArray(newMsgs) && newMsgs.length > 0) {
            const sorted = newMsgs.sort((a, b) => {
              const timeA = a.createdTimestamp || (a.timestamp ? new Date(a.timestamp).getTime() : 0);
              const timeB = b.createdTimestamp || (b.timestamp ? new Date(b.timestamp).getTime() : 0);
              return timeA - timeB;
            });
            for (const raw of sorted) {
              this.handleIncomingMessage(raw);
            }
          }
        } catch (_) {}
      }
    }, 3000);
    if (this.ssePollTimer.unref) this.ssePollTimer.unref();
  }

  stopSsePolling() {
    if (this.ssePollTimer) {
      clearInterval(this.ssePollTimer);
      this.ssePollTimer = null;
    }
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
