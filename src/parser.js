const EMOJI_MAP = {
  '🎯': 'Valorant',
  '🔫': 'Valorant',
  '⚔️': 'League of Legends',
  '🧙': 'League of Legends',
  '📹': 'IRL',
  '🏙️': 'IRL',
  '🎮': 'Diğer Oyunlar',
  '🤡': 'Meme',
  '🐸': 'Meme',
  '💀': 'Meme',
  '🤣': 'Meme',
  '😂': 'Meme'
};

const GAME_CATALOG = [
  // Primary
  { name: 'Valorant', category: 'Valorant', tags: ['val', 'valorant'], keywords: ['valorant', 'vandal', 'phantom', 'jett', 'reyna', 'radiant', 'omen', 'sova', 'sage'] },
  { name: 'League of Legends', category: 'League of Legends', tags: ['lol', 'league'], keywords: ['league of legends', 'lol', 'baron', 'yasuo', 'pentakill', 'jungler', 'draven', 'zed'] },
  { name: 'IRL', category: 'IRL', tags: ['irl'], keywords: ['irl', 'dışarı', 'gezi', 'buluşma', 'tatil', 'restoran', 'araba', 'vlog', 'belgesel', 'röportaj', 'maaş', 'hayatımı', 'inside', 'hours', 'türkiye', 'america', 'asgari', 'emekli', 'sokak'] },
  { name: 'Meme', category: 'Meme', tags: ['meme', 'komik'], keywords: ['shitpost', 'bruh', 'troll', 'caps', 'gülünç', 'meme', 'mim', 'vine', 'aykut', 'aykutelmas', 'gülme', 'karaoke', 'şarkı', 'parodi', 'montaj', 'edit', 'tiktok', 'funny', 'korna', 'çık dışarı', 'kahkaha', 'endişe', 'panik', 'gariban', 'komik', 'dino', 'speed'] },

  // Diğer Oyunlar with specific titles
  { name: 'Counter-Strike 2', category: 'Diğer Oyunlar', tags: ['cs', 'cs2', 'csgo'], keywords: ['counter-strike', 'cs2', 'csgo', 'cs:go', 'deagle', 'mirage', 'dust2', 'awp', 'inferno', 'overpass', 'yoldaş', 'unlost', 'silver'] },
  { name: 'Grand Theft Auto V', category: 'Diğer Oyunlar', tags: ['gta', 'gtav', 'gtarp', 'fivem'], keywords: ['gta', 'gta 5', 'gta v', 'gta rp', 'fivem', 'los santos'] },
  { name: 'Minecraft', category: 'Diğer Oyunlar', tags: ['mc', 'minecraft'], keywords: ['minecraft', 'creeper', 'nether', 'bedwars', 'skywars', 'elder guardian'] },
  { name: 'Apex Legends', category: 'Diğer Oyunlar', tags: ['apex'], keywords: ['apex legends', 'apex', 'wraith', 'pathfinder', 'gibraltar'] },
  { name: 'Tom Clancy\'s Rainbow Six Siege', category: 'Diğer Oyunlar', tags: ['r6', 'siege'], keywords: ['rainbow six', 'rainbow 6', 'r6', 'siege'] },
  { name: 'Rocket League', category: 'Diğer Oyunlar', tags: ['rl', 'rocketleague'], keywords: ['rocket league', 'aerial', 'supersonic', 'octane', 'fennec'] },
  { name: 'Rust', category: 'Diğer Oyunlar', tags: ['rust'], keywords: ['rust', 'airdrop', 'base raid'] },
  { name: 'Overwatch 2', category: 'Diğer Oyunlar', tags: ['ow', 'ow2', 'overwatch'], keywords: ['overwatch', 'ow2', 'genji', 'tracer', 'mercy'] },
  { name: 'Fortnite', category: 'Diğer Oyunlar', tags: ['fn', 'fortnite'], keywords: ['fortnite', 'victory royale', 'chug jug', 'tilted towers'] },
  { name: 'Roblox', category: 'Diğer Oyunlar', tags: ['roblox'], keywords: ['roblox', 'bloxfruits', 'blox fruits', 'brookhaven'] },
  { name: 'Elden Ring', category: 'Diğer Oyunlar', tags: ['eldenring', 'souls'], keywords: ['elden ring', 'dark souls', 'malenia', 'radahn', 'tarnished'] },
  { name: 'EA SPORTS FC / FIFA', category: 'Diğer Oyunlar', tags: ['fifa', 'eafc', 'fc24', 'fc25'], keywords: ['fifa', 'ea fc', 'fc 24', 'fc 25', 'fut', 'ultimate team'] },
  { name: 'Dead by Daylight', category: 'Diğer Oyunlar', tags: ['dbd'], keywords: ['dead by daylight', 'dbd', 'survivor', 'gen rush'] },
  { name: 'Lethal Company', category: 'Diğer Oyunlar', tags: ['lethal'], keywords: ['lethal company', 'quota', 'scrap'] },
  { name: 'Dota 2', category: 'Diğer Oyunlar', tags: ['dota', 'dota2'], keywords: ['dota', 'dota 2', 'invoker', 'pudge', 'roshan'] },
  { name: 'Teamfight Tactics', category: 'Diğer Oyunlar', tags: ['tft'], keywords: ['teamfight tactics', 'tft', 'reroll', 'hyper roll'] },
  { name: 'PUBG', category: 'Diğer Oyunlar', tags: ['pubg'], keywords: ['pubg', 'playerunknown', 'erangel', 'miramar'] },
  { name: 'Call of Duty / Warzone', category: 'Diğer Oyunlar', tags: ['cod', 'warzone'], keywords: ['call of duty', 'warzone', 'modern warfare', 'black ops', 'gulag'] },
  { name: 'Helldivers 2', category: 'Diğer Oyunlar', tags: ['helldivers'], keywords: ['helldivers', 'helldivers 2', 'super earth'] },
  { name: 'Terraria', category: 'Diğer Oyunlar', tags: ['terraria'], keywords: ['terraria', 'moon lord'] },
  { name: 'Brawl Stars', category: 'Diğer Oyunlar', tags: ['brawlstars'], keywords: ['brawl stars', 'brawlstars', 'gem grab'] },
  { name: 'Clash Royale', category: 'Diğer Oyunlar', tags: ['clash'], keywords: ['clash royale', 'clashroyale'] }
];

let dynamicGameCatalog = null;
let dynamicEmojiMap = null;

function refreshParserCatalog() {
  try {
    const db = require('./db');
    if (typeof db.getGameCatalog === 'function') {
      const games = db.getGameCatalog();
      if (games && games.length > 0) {
        dynamicGameCatalog = games;
      }
    }
    if (typeof db.getCategoryEmojis === 'function') {
      const emojis = db.getCategoryEmojis();
      if (emojis && Object.keys(emojis).length > 0) {
        dynamicEmojiMap = emojis;
      }
    }
  } catch (e) {
    // Fall back to static defaults
  }
}

function getActiveGameCatalog() {
  if (!dynamicGameCatalog) {
    refreshParserCatalog();
  }
  return dynamicGameCatalog || GAME_CATALOG;
}

function getActiveEmojiMap() {
  if (!dynamicEmojiMap) {
    refreshParserCatalog();
  }
  return dynamicEmojiMap || EMOJI_MAP;
}

function mapEmojiToCategory(emoji) {
  return getActiveEmojiMap()[emoji] || null;
}

function detectGameAndCategory(text = '') {
  if (!text) return { category: 'Genel', gameName: null };
  const lower = text.toLowerCase();
  const catalog = getActiveGameCatalog();
  const emojiMap = getActiveEmojiMap();

  // 1. Tag matching
  for (const game of catalog) {
    for (const tag of (game.tags || [])) {
      const tagRegex = new RegExp(`(?:#|\\[)${tag}(?:\\b|\\])`, 'i');
      if (tagRegex.test(lower)) {
        return { category: game.category, gameName: game.name };
      }
    }
  }

  // 2. In-message emoji matching
  for (const [emoji, cat] of Object.entries(emojiMap)) {
    if (text.includes(emoji)) {
      const match = catalog.find(g => g.category === cat);
      return { category: cat, gameName: match ? match.name : null };
    }
  }

  // 3. Keyword matching (must start at word boundary)
  for (const game of catalog) {
    for (const kw of (game.keywords || [])) {
      const reg = new RegExp(`(?<![\\p{L}\\p{N}])${kw}`, 'iu');
      if (reg.test(lower)) {
        return { category: game.category, gameName: game.name };
      }
    }
  }

  return { category: 'Genel', gameName: null };
}

function detectCategory(text = '') {
  return detectGameAndCategory(text).category;
}

function extractMedia(message) {
  // Check attachments first
  const attachments = message.attachments ? Array.from(message.attachments.values()) : [];
  for (const att of attachments) {
    const filename = (att.name || '').toLowerCase();
    const contentType = (att.contentType || '').toLowerCase();
    const isVideoFile = 
      contentType.startsWith('video/') ||
      filename.endsWith('.mp4') ||
      filename.endsWith('.mov') ||
      filename.endsWith('.webm');

    if (isVideoFile) {
      return {
        isVideo: true,
        mediaType: 'video_discord',
        url: att.url,
        attachmentId: att.id || null
      };
    }
  }

  // Check YouTube link in content
  const ytMatch = (message.content || '').match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+)/i);
  if (ytMatch) {
    let cleanUrl = ytMatch[1];
    // Convert to standard embed URL
    const videoIdMatch = cleanUrl.match(/(?:watch\?v=|youtu\.be\/)([\w-]+)/);
    const embedUrl = videoIdMatch ? `https://www.youtube-nocookie.com/embed/${videoIdMatch[1]}` : cleanUrl;
    return {
      isVideo: true,
      mediaType: 'youtube',
      url: embedUrl,
      attachmentId: null
    };
  }

  return { isVideo: false, mediaType: 'none', url: '', attachmentId: null };
}

function extractVaultItems(message) {
  const items = [];
  const seenUrls = new Set();

  // 1. Check message embeds (GIF providers: Tenor, Klipy, Giphy, Gifv, or image embeds)
  const embeds = message.embeds ? (Array.isArray(message.embeds) ? message.embeds : Array.from(message.embeds.values())) : [];
  for (const emb of embeds) {
    const data = emb.data || emb;
    const type = (data.type || '').toLowerCase();
    const provider = (data.provider?.name || '').toLowerCase();
    const isGifProvider = type === 'gifv' || ['tenor', 'klipy', 'giphy'].includes(provider);

    if (isGifProvider) {
      const videoUrl = data.video?.url || data.video?.proxy_url;
      const imgUrl = data.thumbnail?.proxy_url || data.thumbnail?.url || data.image?.proxy_url || data.image?.url;
      const targetUrl = videoUrl || imgUrl;
      if (targetUrl && !seenUrls.has(targetUrl)) {
        seenUrls.add(targetUrl);
        const title = (data.title || '').replace(/\s*-\s*Discover & Share GIFs/i, '').trim();
        items.push({
          mediaType: 'gif',
          url: targetUrl,
          title: title,
          attachmentId: null
        });
      }
    } else if (type === 'image') {
      const imgUrl = data.image?.url || data.thumbnail?.url;
      if (imgUrl && !seenUrls.has(imgUrl)) {
        seenUrls.add(imgUrl);
        const isGif = imgUrl.toLowerCase().includes('.gif');
        items.push({
          mediaType: isGif ? 'gif' : 'image',
          url: imgUrl,
          title: (data.title || '').trim(),
          attachmentId: null
        });
      }
    }
  }

  // 2. Direct regex for .gif / .gifv URLs in content
  const gifUrls = (message.content || '').match(/https?:\/\/[^\s<>]+\.(?:gif|gifv)(?:\?[^\s<>]*)?/gi);
  if (gifUrls) {
    for (const u of gifUrls) {
      if (!seenUrls.has(u)) {
        seenUrls.add(u);
        items.push({
          mediaType: 'gif',
          url: u,
          title: '',
          attachmentId: null
        });
      }
    }
  }

  // 3. Attachments (Images and GIFs)
  const attachments = message.attachments ? (Array.isArray(message.attachments) ? message.attachments : Array.from(message.attachments.values())) : [];
  for (const att of attachments) {
    const fn = (att.name || '').toLowerCase();
    const ct = (att.contentType || '').toLowerCase();
    const isGif = ct === 'image/gif' || fn.endsWith('.gif');
    const isImage = ct.startsWith('image/') || fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.webp');

    if (isGif) {
      if (!seenUrls.has(att.url)) {
        seenUrls.add(att.url);
        items.push({
          mediaType: 'gif',
          url: att.url,
          title: '',
          attachmentId: att.id || null
        });
      }
    } else if (isImage) {
      if (!seenUrls.has(att.url)) {
        seenUrls.add(att.url);
        items.push({
          mediaType: 'image',
          url: att.url,
          title: '',
          attachmentId: att.id || null
        });
      }
    }
  }

  return items;
}

module.exports = {
  detectCategory,
  detectGameAndCategory,
  mapEmojiToCategory,
  extractMedia,
  extractVaultItems,
  refreshParserCatalog,
  GAME_CATALOG
};
