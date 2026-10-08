const test = require('node:test');
const assert = require('node:assert');
const { detectCategory, detectGameAndCategory, extractMedia, extractVaultItems, mapEmojiToCategory } = require('../src/parser');

test('Category & Game Parser: accurately detects tags, emojis, keywords, and specific game titles', () => {
  // 1. Tags
  assert.strictEqual(detectCategory('amazing ace #val'), 'Valorant');
  assert.strictEqual(detectCategory('[lol] baron steal'), 'League of Legends');
  assert.strictEqual(detectCategory('dünkü akşam yemeği #irl'), 'IRL');
  assert.strictEqual(detectCategory('komik an #meme'), 'Meme');
  assert.strictEqual(detectCategory('[komik] bu ne ya'), 'Meme');

  // 2. In-message emojis
  assert.strictEqual(detectCategory('clutch anı 🎯'), 'Valorant');
  assert.strictEqual(detectCategory('gank faciası ⚔️'), 'League of Legends');
  assert.strictEqual(detectCategory('yürüyüş videosu 📹'), 'IRL');
  assert.strictEqual(detectCategory('troll video 🤡'), 'Meme');
  assert.strictEqual(detectCategory('buna çok güldüm 💀'), 'Meme');
  assert.strictEqual(detectCategory('pepe anı 🐸'), 'Meme');

  // 3. Keywords
  assert.strictEqual(detectCategory('vandal ile tek attım'), 'Valorant');
  assert.strictEqual(detectCategory('yasuo 0-10 feedledi'), 'League of Legends');
  assert.strictEqual(detectCategory('dışarıda kahve içerken'), 'IRL');
  assert.strictEqual(detectCategory('efsane bir shitpost'), 'Meme');
  assert.strictEqual(detectCategory('tam bir bruh momenti'), 'Meme');
  assert.strictEqual(detectCategory('anlamsız bir muhabbet'), 'Genel');

  // 4. Specific games detection
  const cs = detectGameAndCategory('inanılmaz bir cs2 clutch');
  assert.strictEqual(cs.category, 'Diğer Oyunlar');
  assert.strictEqual(cs.gameName, 'Counter-Strike 2');

  const gta = detectGameAndCategory('fivem gta rp komik anlar #gtav');
  assert.strictEqual(gta.category, 'Diğer Oyunlar');
  assert.strictEqual(gta.gameName, 'Grand Theft Auto V');

  const mc = detectGameAndCategory('minecraft hardcore ep 1');
  assert.strictEqual(mc.category, 'Diğer Oyunlar');
  assert.strictEqual(mc.gameName, 'Minecraft');

  const val = detectGameAndCategory('vandal tek attım');
  assert.strictEqual(val.category, 'Valorant');
  assert.strictEqual(val.gameName, 'Valorant');

  // 5. Reaction emoji mapping
  assert.strictEqual(mapEmojiToCategory('🎯'), 'Valorant');
  assert.strictEqual(mapEmojiToCategory('⚔️'), 'League of Legends');
  assert.strictEqual(mapEmojiToCategory('📹'), 'IRL');
  assert.strictEqual(mapEmojiToCategory('🤡'), 'Meme');
  assert.strictEqual(mapEmojiToCategory('🐸'), 'Meme');
  assert.strictEqual(mapEmojiToCategory('💀'), 'Meme');
  assert.strictEqual(mapEmojiToCategory('👍'), null);
});

test('Media & Vault Extractor: extracts Discord videos, YouTube, Tenor/Klipy GIF embeds, and ignores text', () => {
  // 1. Discord MP4 attachment
  const discordVideoMsg = {
    content: 'Check this out',
    attachments: new Map([['att1', { name: 'clip.mp4', contentType: 'video/mp4', url: 'https://cdn.discordapp.com/clip.mp4', id: 'att1' }]])
  };
  const videoResult = extractMedia(discordVideoMsg);
  assert.strictEqual(videoResult.isVideo, true);
  assert.strictEqual(videoResult.mediaType, 'video_discord');

  // 2. YouTube link
  const ytMsg = {
    content: 'Watch this https://youtu.be/dQw4w9WgXcQ epic clip',
    attachments: new Map()
  };
  const ytResult = extractMedia(ytMsg);
  assert.strictEqual(ytResult.isVideo, true);
  assert.strictEqual(ytResult.mediaType, 'youtube');

  // 3. Tenor / Klipy GIF embed
  const tenorMsg = {
    content: 'https://tenor.com/view/funny-cat-12345',
    embeds: [{
      data: {
        type: 'gifv',
        provider: { name: 'Tenor' },
        title: 'Funny Cat - Discover & Share GIFs',
        video: { url: 'https://media.tenor.com/cat.mp4' },
        thumbnail: { proxy_url: 'https://images-ext-1.discordapp.net/cat.gif' }
      }
    }]
  };
  const tenorItems = extractVaultItems(tenorMsg);
  assert.strictEqual(tenorItems.length, 1);
  assert.strictEqual(tenorItems[0].mediaType, 'gif');
  assert.strictEqual(tenorItems[0].title, 'Funny Cat');

  // 4. Image & GIF attachments
  const attMsg = {
    content: 'photos',
    attachments: new Map([
      ['att1', { name: 'meme.png', contentType: 'image/png', url: 'https://cdn.discordapp.com/meme.png', id: 'att1' }],
      ['att2', { name: 'anim.gif', contentType: 'image/gif', url: 'https://cdn.discordapp.com/anim.gif', id: 'att2' }]
    ])
  };
  const attItems = extractVaultItems(attMsg);
  assert.strictEqual(attItems.length, 2);
  assert.strictEqual(attItems[0].mediaType, 'image');
  assert.strictEqual(attItems[1].mediaType, 'gif');

  // 5. Pure text message (must be ignored)
  const pureTextMsg = {
    content: 'selam kanka akşam oyuna giriyor muyuz?',
    embeds: [],
    attachments: new Map()
  };
  assert.strictEqual(extractMedia(pureTextMsg).isVideo, false);
  assert.strictEqual(extractVaultItems(pureTextMsg).length, 0);
});
