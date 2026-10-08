let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  DatabaseSync = require('better-sqlite3');
}

const path = require('path');
const config = require('./config');
const { encrypt, decrypt } = require('./crypto');
const { 
  DEFAULT_QUOTES, 
  DEFAULT_COUNCIL, 
  DEFAULT_HALL_OF_FAME, 
  DEFAULT_LORE, 
  DEFAULT_RULES, 
  DEFAULT_GAMES, 
  DEFAULT_EMOJIS 
} = require('./dynamicDataDefaults');

let dbInstance = null;

function formatClipRow(row) {
  if (!row) return row;
  try {
    return {
      ...row,
      media_url: decrypt(row.media_url, config.DB_ENCRYPTION_KEY),
      message_url: decrypt(row.message_url, config.DB_ENCRYPTION_KEY),
      attachment_id: row.attachment_id ? decrypt(row.attachment_id, config.DB_ENCRYPTION_KEY) : row.attachment_id
    };
  } catch (err) {
    console.error('[DB] Error decrypting clip row id=' + row.id, err.message);
    return row;
  }
}

function formatImageRow(row) {
  if (!row) return row;
  try {
    return {
      ...row,
      image_url: decrypt(row.image_url, config.DB_ENCRYPTION_KEY),
      attachment_id: row.attachment_id ? decrypt(row.attachment_id, config.DB_ENCRYPTION_KEY) : row.attachment_id
    };
  } catch (err) {
    console.error('[DB] Error decrypting image row id=' + row.id, err.message);
    return row;
  }
}

function closeDb() {
  if (dbInstance && typeof dbInstance.close === 'function') {
    try {
      dbInstance.close();
    } catch (e) {}
    dbInstance = null;
  }
}

function initDb(dbPath = config.DB_PATH) {
  closeDb();
  dbInstance = new DatabaseSync(dbPath);
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA busy_timeout = 5000;');


  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      category TEXT NOT NULL DEFAULT 'Genel',
      game_name TEXT DEFAULT NULL,
      caption TEXT,
      media_type TEXT NOT NULL,
      media_url TEXT NOT NULL,
      attachment_id TEXT,
      message_url TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clips_category ON clips(category);
    CREATE INDEX IF NOT EXISTS idx_clips_author ON clips(author_id);
    CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clips_media_url ON clips(media_url);

    CREATE TABLE IF NOT EXISTS images_vault (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_avatar TEXT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'Meme',
      media_type TEXT NOT NULL,
      image_url TEXT NOT NULL,
      attachment_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_images_created ON images_vault(created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_images_unique_url ON images_vault(image_url);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_images_unique_att ON images_vault(attachment_id);

    CREATE TABLE IF NOT EXISTS vc_stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_seconds INTEGER NOT NULL DEFAULT 12564000,
      tracked_seconds INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO vc_stats (id, base_seconds, tracked_seconds, updated_at)
    VALUES (1, 12564000, 0, 0);

    CREATE TABLE IF NOT EXISTS spotify_users (
      discord_id TEXT PRIMARY KEY,
      spotify_id TEXT NOT NULL,
      spotify_display_name TEXT,
      spotify_profile_url TEXT,
      spotify_avatar_url TEXT,
      discord_username TEXT,
      discord_display_name TEXT,
      discord_avatar_url TEXT,
      refresh_token_encrypted TEXT NOT NULL,
      access_token_encrypted TEXT,
      token_expires_at INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_polled_at INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS spotify_scrobbles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_name TEXT NOT NULL,
      album_art_url TEXT,
      duration_ms INTEGER NOT NULL,
      played_at INTEGER NOT NULL,
      source TEXT DEFAULT 'spotify',
      CONSTRAINT unique_user_play UNIQUE(discord_id, track_id, played_at)
    );

    CREATE INDEX IF NOT EXISTS idx_scrobbles_discord_id ON spotify_scrobbles(discord_id);
    CREATE INDEX IF NOT EXISTS idx_scrobbles_artist ON spotify_scrobbles(artist_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_scrobbles_played_at ON spotify_scrobbles(played_at);
    CREATE INDEX IF NOT EXISTS idx_scrobbles_user_played ON spotify_scrobbles(discord_id, played_at);

    CREATE TABLE IF NOT EXISTS spotify_artist_genres (
      artist_name TEXT PRIMARY KEY COLLATE NOCASE,
      genres TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spotify_artist_images (
      artist_name TEXT PRIMARY KEY COLLATE NOCASE,
      image_url TEXT,
      spotify_id TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artist_images_name ON spotify_artist_images(artist_name COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS discord_users (
      discord_id TEXT PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      avatar_url TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote TEXT NOT NULL,
      author TEXT NOT NULL,
      author_id TEXT,
      added_by TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS council_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      handle TEXT NOT NULL,
      role TEXT NOT NULL,
      glow_color TEXT DEFAULT 'purple',
      image TEXT,
      bio TEXT,
      traits TEXT,
      avatar_emoji TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      recipient TEXT NOT NULL,
      handle TEXT NOT NULL,
      badge TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT DEFAULT 'purple',
      display_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lore_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      num TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      tags TEXT NOT NULL,
      keywords TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_emojis (
      emoji TEXT PRIMARY KEY,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_access (
      feature_name TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      granted_by TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (feature_name, discord_id)
    );
  `);

  try {
    dbInstance.exec('ALTER TABLE clips ADD COLUMN game_name TEXT DEFAULT NULL;');
  } catch (e) {
    // Column already exists
  }
  try { dbInstance.exec('ALTER TABLE images_vault ADD COLUMN blob_id TEXT DEFAULT NULL;'); } catch (e) {}
  try { dbInstance.exec('ALTER TABLE clips ADD COLUMN blob_id TEXT DEFAULT NULL;'); } catch (e) {}
  try { dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_images_blob_id ON images_vault(blob_id);'); } catch (e) {}
  try { dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_clips_blob_id ON clips(blob_id);'); } catch (e) {}

  try { dbInstance.exec('ALTER TABLE spotify_users ADD COLUMN discord_username TEXT;'); } catch (e) {}
  try { dbInstance.exec('ALTER TABLE spotify_users ADD COLUMN discord_display_name TEXT;'); } catch (e) {}
  try { dbInstance.exec('ALTER TABLE spotify_users ADD COLUMN discord_avatar_url TEXT;'); } catch (e) {}
  try { dbInstance.exec("ALTER TABLE spotify_scrobbles ADD COLUMN source TEXT DEFAULT 'spotify';"); } catch (e) {}
  try { dbInstance.exec("CREATE INDEX IF NOT EXISTS idx_scrobbles_source ON spotify_scrobbles(source);"); } catch (e) {}
  try {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS spotify_artist_images (
        artist_name TEXT PRIMARY KEY COLLATE NOCASE,
        image_url TEXT,
        spotify_id TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artist_images_name ON spotify_artist_images(artist_name COLLATE NOCASE);
    `);
  } catch (e) {}

  try {
    // Auto-seed discord_users from existing clips, vault images, and spotify_users
    dbInstance.exec(`
      INSERT OR IGNORE INTO discord_users (discord_id, username, display_name, avatar_url, updated_at)
      SELECT author_id, author_name, author_name, author_avatar, MAX(created_at)
      FROM clips WHERE author_id IS NOT NULL AND author_id != '' GROUP BY author_id;

      INSERT OR IGNORE INTO discord_users (discord_id, username, display_name, avatar_url, updated_at)
      SELECT user_id, user_name, user_name, user_avatar, MAX(created_at)
      FROM images_vault WHERE user_id IS NOT NULL AND user_id != '' GROUP BY user_id;

      INSERT OR IGNORE INTO discord_users (discord_id, username, display_name, avatar_url, updated_at)
      SELECT discord_id, discord_username, COALESCE(discord_display_name, discord_username), discord_avatar_url, created_at
      FROM spotify_users WHERE discord_id IS NOT NULL;
    `);
  } catch (e) {
    // Ignore seed errors
  }

  seedDynamicDefaults(dbInstance);

  return dbInstance;
}

function getDb() {
  if (!dbInstance) {
    return initDb();
  }
  return dbInstance;
}

function insertClip(clip) {
  const db = getDb();
  const encryptedMediaUrl = encrypt(clip.media_url, config.DB_ENCRYPTION_KEY);
  const encryptedMessageUrl = encrypt(clip.message_url, config.DB_ENCRYPTION_KEY);
  const encryptedAttachmentId = clip.attachment_id ? encrypt(clip.attachment_id, config.DB_ENCRYPTION_KEY) : null;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO clips 
    (message_id, channel_id, author_id, author_name, author_avatar, category, game_name, caption, media_type, media_url, attachment_id, message_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    clip.message_id,
    clip.channel_id,
    clip.author_id,
    clip.author_name,
    clip.author_avatar || '',
    clip.category || 'Genel',
    clip.game_name || null,
    clip.caption || '',
    clip.media_type,
    encryptedMediaUrl,
    encryptedAttachmentId,
    encryptedMessageUrl,
    clip.created_at
  );
}

function updateClipCategory(messageId, newCategory, newGameName = null) {
  const db = getDb();
  if (newGameName !== null) {
    const stmt = db.prepare(`UPDATE clips SET category = ?, game_name = ? WHERE message_id = ? OR id = ?`);
    return stmt.run(newCategory, newGameName, messageId, messageId);
  }
  const stmt = db.prepare(`UPDATE clips SET category = ? WHERE message_id = ? OR id = ?`);
  return stmt.run(newCategory, messageId, messageId);
}

function getClipByMessageId(messageId) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM clips WHERE message_id = ? OR id = ?');
  const row = stmt.get(messageId, messageId);
  return row ? formatClipRow(row) : null;
}

const GAME_ABBREVIATIONS = {
  'cs': ['Counter-Strike 2'],
  'cs2': ['Counter-Strike 2'],
  'csgo': ['Counter-Strike 2'],
  'gta': ['Grand Theft Auto V'],
  'gtav': ['Grand Theft Auto V'],
  'fivem': ['Grand Theft Auto V'],
  'mc': ['Minecraft'],
  'val': ['Valorant'],
  'lol': ['League of Legends'],
  'league': ['League of Legends'],
  'r6': ['Tom Clancy\'s Rainbow Six Siege'],
  'siege': ['Tom Clancy\'s Rainbow Six Siege'],
  'rl': ['Rocket League'],
  'ow': ['Overwatch 2'],
  'ow2': ['Overwatch 2'],
  'fn': ['Fortnite'],
  'dbd': ['Dead by Daylight'],
  'cod': ['Call of Duty / Warzone'],
  'wz': ['Call of Duty / Warzone'],
  'tft': ['Teamfight Tactics'],
  'fifa': ['EA SPORTS FC / FIFA'],
  'eafc': ['EA SPORTS FC / FIFA']
};

function getClips(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  // YouTube isolation: YouTube links only show under 'YouTube' category
  if (filters.category === 'YouTube') {
    conditions.push("media_type = 'youtube'");
  } else if (filters.category && filters.category !== 'Tümü') {
    conditions.push('category = ?');
    params.push(filters.category);
    if (!filters.include_youtube) {
      conditions.push("media_type != 'youtube'");
    }
  } else {
    // Default 'Tümü' / main archive view: strictly exclude YouTube links
    if (!filters.include_youtube) {
      conditions.push("media_type != 'youtube'");
    }
  }

  if (filters.author_id) {
    conditions.push('author_id = ?');
    params.push(filters.author_id);
  }
  if (filters.query) {
    const rawQuery = filters.query.trim().toLowerCase();
    const aliasMatches = GAME_ABBREVIATIONS[rawQuery] || [];

    if (aliasMatches.length > 0) {
      const placeholders = aliasMatches.map(() => '?').join(', ');
      conditions.push(`(caption LIKE ? OR author_name LIKE ? OR game_name LIKE ? OR game_name IN (${placeholders}) OR category IN (${placeholders}))`);
      params.push(`%${filters.query}%`, `%${filters.query}%`, `%${filters.query}%`, ...aliasMatches, ...aliasMatches);
    } else {
      conditions.push('(caption LIKE ? OR author_name LIKE ? OR game_name LIKE ?)');
      params.push(`%${filters.query}%`, `%${filters.query}%`, `%${filters.query}%`);
    }
  }
  if (filters.from) {
    conditions.push('created_at >= ?');
    params.push(Number(filters.from));
  }
  if (filters.to) {
    conditions.push('created_at <= ?');
    params.push(Number(filters.to));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM clips ${whereClause}`);
  const countRow = countStmt.get(...params);
  const total = countRow ? countRow.total : 0;

  const limit = parseInt(filters.limit || '20', 10);
  const page = parseInt(filters.page || '1', 10);
  const offset = (page - 1) * limit;
  const sortDir = filters.sort === 'asc' ? 'ASC' : 'DESC';

  const dataStmt = db.prepare(`SELECT * FROM clips ${whereClause} ORDER BY created_at ${sortDir} LIMIT ? OFFSET ?`);
  const clips = dataStmt.all(...params, limit, offset);

  return { total, page, limit, clips: clips.map(formatClipRow) };
}

function deleteClip(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM clips WHERE id = ?');
  return stmt.run(id);
}

function deleteImage(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM images_vault WHERE id = ?');
  return stmt.run(id);
}

function updateClipCaption(messageId, caption) {
  const db = getDb();
  const stmt = db.prepare("UPDATE clips SET caption = ? WHERE message_id = ? AND (caption IS NULL OR caption = '' OR caption = ' ')");
  return stmt.run(caption, messageId);
}

function insertImage(img) {
  const db = getDb();
  const encryptedImageUrl = encrypt(img.image_url, config.DB_ENCRYPTION_KEY);
  const encryptedAttachmentId = img.attachment_id ? encrypt(img.attachment_id, config.DB_ENCRYPTION_KEY) : null;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO images_vault 
    (user_id, user_name, user_avatar, title, category, media_type, image_url, attachment_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    img.user_id,
    img.user_name,
    img.user_avatar || '',
    img.title || 'Görsel',
    img.category || 'Meme',
    img.media_type || 'image',
    encryptedImageUrl,
    encryptedAttachmentId,
    img.created_at || Date.now()
  );
}

function getImages(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (filters.category && filters.category !== 'Tümü') {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters.media_type) {
    conditions.push('media_type = ?');
    params.push(filters.media_type);
  }
  if (filters.query) {
    conditions.push('(title LIKE ? OR user_name LIKE ?)');
    params.push(`%${filters.query}%`, `%${filters.query}%`);
  }

  const limit = parseInt(filters.limit, 10) || 250;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT * FROM images_vault ${whereClause} ORDER BY created_at DESC LIMIT ?`);
  return stmt.all(...params, limit).map(formatImageRow);
}

function getImageById(id) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM images_vault WHERE id = ?');
  const row = stmt.get(id);
  return row ? formatImageRow(row) : null;
}

function getClipById(id) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM clips WHERE id = ?');
  const row = stmt.get(id);
  return row ? formatClipRow(row) : null;
}

function updateImageVaultBlob(id, blobId, localUrl = null) {
  const db = getDb();
  if (localUrl) {
    const encryptedUrl = encrypt(localUrl, config.DB_ENCRYPTION_KEY);
    const stmt = db.prepare('UPDATE images_vault SET blob_id = ?, image_url = ? WHERE id = ?');
    return stmt.run(blobId, encryptedUrl, id);
  }
  const stmt = db.prepare('UPDATE images_vault SET blob_id = ? WHERE id = ?');
  return stmt.run(blobId, id);
}

function updateClipVaultBlob(id, blobId, localUrl = null) {
  const db = getDb();
  if (localUrl) {
    const encryptedUrl = encrypt(localUrl, config.DB_ENCRYPTION_KEY);
    const stmt = db.prepare('UPDATE clips SET blob_id = ?, media_url = ? WHERE id = ?');
    return stmt.run(blobId, encryptedUrl, id);
  }
  const stmt = db.prepare('UPDATE clips SET blob_id = ? WHERE id = ?');
  return stmt.run(blobId, id);
}

function getStats() {
  const db = getDb();
  const totalClips = db.prepare('SELECT COUNT(*) as c FROM clips').get().c;
  const totalImages = db.prepare('SELECT COUNT(*) as c FROM images_vault').get().c;
  const categories = db.prepare('SELECT category, COUNT(*) as c FROM clips GROUP BY category').all();
  return { totalClips, totalImages, categories };
}

function getPublicClipCount() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as c FROM clips').get();
  return row ? row.c : 0;
}

function addVoiceSeconds(seconds) {
  if (!seconds || seconds <= 0) return;
  const db = getDb();
  db.prepare(`
    UPDATE vc_stats 
    SET tracked_seconds = tracked_seconds + ?, updated_at = ?
    WHERE id = 1
  `).run(Math.round(seconds), Date.now());
}

function getPublicVcHours(inFlightSeconds = 0) {
  const db = getDb();
  const row = db.prepare('SELECT base_seconds, tracked_seconds FROM vc_stats WHERE id = 1').get();
  const base = row ? row.base_seconds : 12564000;
  const tracked = row ? row.tracked_seconds : 0;
  const totalSeconds = base + tracked + Math.round(inFlightSeconds);
  const totalHours = Math.floor(totalSeconds / 3600);
  return totalHours.toLocaleString('en-US') + '+';
}

function getVcStatsRaw() {
  const db = getDb();
  return db.prepare('SELECT * FROM vc_stats WHERE id = 1').get();
}

// ==========================================
// SPOTIFY SCROBBLER & WRAPPED DATABASE LAYER
// ==========================================

function upsertSpotifyUser(user) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO spotify_users (
      discord_id, spotify_id, spotify_display_name, spotify_profile_url,
      spotify_avatar_url, discord_username, discord_display_name, discord_avatar_url,
      refresh_token_encrypted, access_token_encrypted,
      token_expires_at, created_at, last_polled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      spotify_id = excluded.spotify_id,
      spotify_display_name = excluded.spotify_display_name,
      spotify_profile_url = excluded.spotify_profile_url,
      spotify_avatar_url = excluded.spotify_avatar_url,
      discord_username = COALESCE(excluded.discord_username, spotify_users.discord_username),
      discord_display_name = COALESCE(excluded.discord_display_name, spotify_users.discord_display_name),
      discord_avatar_url = COALESCE(excluded.discord_avatar_url, spotify_users.discord_avatar_url),
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      access_token_encrypted = excluded.access_token_encrypted,
      token_expires_at = excluded.token_expires_at,
      last_polled_at = excluded.last_polled_at;
  `);

  stmt.run(
    user.discord_id,
    user.spotify_id,
    user.spotify_display_name || null,
    user.spotify_profile_url || null,
    user.spotify_avatar_url || null,
    user.discord_username || null,
    user.discord_display_name || null,
    user.discord_avatar_url || null,
    user.refresh_token_encrypted,
    user.access_token_encrypted || null,
    user.token_expires_at || 0,
    user.created_at || Date.now(),
    user.last_polled_at || 0
  );
}

function getSpotifyUser(discordId) {
  const db = getDb();
  return db.prepare('SELECT * FROM spotify_users WHERE discord_id = ?').get(discordId);
}

function getAllSpotifyUsers() {
  const db = getDb();
  return db.prepare('SELECT * FROM spotify_users').all();
}

function deleteSpotifyUser(discordId) {
  const db = getDb();
  return db.prepare('DELETE FROM spotify_users WHERE discord_id = ?').run(discordId);
}

function updateSpotifyTokens(discordId, accessTokenEnc, expiresAt, refreshTokenEnc = null) {
  const db = getDb();
  if (refreshTokenEnc) {
    db.prepare(`
      UPDATE spotify_users 
      SET access_token_encrypted = ?, token_expires_at = ?, refresh_token_encrypted = ?
      WHERE discord_id = ?
    `).run(accessTokenEnc, expiresAt, refreshTokenEnc, discordId);
  } else {
    db.prepare(`
      UPDATE spotify_users 
      SET access_token_encrypted = ?, token_expires_at = ?
      WHERE discord_id = ?
    `).run(accessTokenEnc, expiresAt, discordId);
  }
}

function updateSpotifyLastPolled(discordId, lastPolledTimestamp) {
  const db = getDb();
  db.prepare('UPDATE spotify_users SET last_polled_at = ? WHERE discord_id = ?').run(lastPolledTimestamp, discordId);
}

function upsertDiscordUser({ discord_id, username, display_name, avatar_url }) {
  if (!discord_id) return;
  const db = getDb();
  try {
    const finalDisplayName = display_name || username || '';
    db.prepare(`
      INSERT INTO discord_users (discord_id, username, display_name, avatar_url, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET
        username = CASE WHEN excluded.username != '' THEN excluded.username ELSE discord_users.username END,
        display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE discord_users.display_name END,
        avatar_url = CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE discord_users.avatar_url END,
        updated_at = excluded.updated_at
    `).run(
      discord_id,
      username || '',
      finalDisplayName,
      avatar_url || '',
      Date.now()
    );
  } catch (e) {
    // Ignore upsert error
  }
}

function upsertDiscordUsersBatch(users) {
  if (!users || users.length === 0) return 0;
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO discord_users (discord_id, username, display_name, avatar_url, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = CASE WHEN excluded.username != '' THEN excluded.username ELSE discord_users.username END,
      display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE discord_users.display_name END,
      avatar_url = CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE discord_users.avatar_url END,
      updated_at = excluded.updated_at
  `);

  if (typeof db.transaction === 'function') {
    const insertMany = db.transaction((list) => {
      let count = 0;
      for (const u of list) {
        if (!u.discord_id) continue;
        const finalDisplayName = u.display_name || u.username || '';
        stmt.run(u.discord_id, u.username || '', finalDisplayName, u.avatar_url || '', now);
        count++;
      }
      return count;
    });
    return insertMany(users);
  } else {
    let count = 0;
    for (const u of users) {
      if (!u.discord_id) continue;
      const finalDisplayName = u.display_name || u.username || '';
      try {
        stmt.run(u.discord_id, u.username || '', finalDisplayName, u.avatar_url || '', now);
        count++;
      } catch (e) {}
    }
    return count;
  }
}

function getDiscordUser(discordId) {
  if (!discordId) return null;
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM discord_users WHERE discord_id = ?').get(discordId);
  } catch {
    return null;
  }
}

function insertScrobbles(discordId, tracks, defaultSource = 'spotify') {
  if (!tracks || tracks.length === 0) return 0;
  const db = getDb();
  const checkDupe = db.prepare(`
    SELECT id FROM spotify_scrobbles
    WHERE discord_id = ? AND (
      (track_id = ? AND ABS(played_at - ?) < 60)
      OR (artist_name = ? COLLATE NOCASE AND track_name = ? COLLATE NOCASE AND ABS(played_at - ?) < 120)
    )
    LIMIT 1
  `);
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO spotify_scrobbles (
      discord_id, track_id, track_name, artist_name, album_name, album_art_url, duration_ms, played_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  let inserted = 0;
  let inTx = false;
  if (typeof db.transaction === 'function') {
    const insertMany = db.transaction((items) => {
      for (const t of items) {
        if (!t.track_id || !t.played_at) continue;
        const existing = checkDupe.get(discordId, t.track_id, t.played_at, t.artist_name || '', t.track_name || '', t.played_at);
        if (existing) continue;

        const source = t.source || defaultSource;
        const res = stmt.run(
          discordId,
          t.track_id,
          t.track_name,
          t.artist_name,
          t.album_name || '',
          t.album_art_url || null,
          t.duration_ms || 0,
          t.played_at,
          source
        );
        if (res.changes > 0) inserted++;
      }
    });
    insertMany(tracks);
  } else {
    try {
      db.exec('BEGIN');
      inTx = true;
    } catch {
      inTx = false;
    }

    try {
      for (const t of tracks) {
        if (!t.track_id || !t.played_at) continue;
        const existing = checkDupe.get(discordId, t.track_id, t.played_at, t.artist_name || '', t.track_name || '', t.played_at);
        if (existing) continue;

        const source = t.source || defaultSource;
        const res = stmt.run(
          discordId,
          t.track_id,
          t.track_name,
          t.artist_name,
          t.album_name || '',
          t.album_art_url || null,
          t.duration_ms || 0,
          t.played_at,
          source
        );
        if (res.changes > 0) inserted++;
      }
      if (inTx) db.exec('COMMIT');
    } catch (err) {
      if (inTx) {
        try { db.exec('ROLLBACK'); } catch {}
      }
      throw err;
    }
  }

  return inserted;
}

function getFilterTimeRange(timeFilter, referenceDate = null) {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const nowMs = now.getTime();
  const raw = String(timeFilter || '').toLowerCase().trim().replace(/[-_ ]/g, '');

  if (raw === 'thisweek' || raw === 'week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return { startSec: Math.floor(d.getTime() / 1000), endSec: null };
  }

  if (raw === 'lastweek') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    const thisMonSec = Math.floor(d.getTime() / 1000);
    const lastMonSec = thisMonSec - 7 * 86400;
    const lastSunSec = thisMonSec - 1;
    return { startSec: lastMonSec, endSec: lastSunSec };
  }

  if (raw === 'thismonth' || raw === 'month') {
    const startSec = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime() / 1000);
    return { startSec, endSec: null };
  }

  if (raw === 'lastmonth') {
    const startSec = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime() / 1000);
    const endSec = Math.floor(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime() / 1000);
    return { startSec, endSec };
  }

  if (raw === 'thisyear' || raw === 'year') {
    const startOfYear = Math.floor(new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime() / 1000);
    return { startSec: startOfYear, endSec: null };
  }

  if (raw === 'lastyear') {
    const startSec = Math.floor(new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0).getTime() / 1000);
    const endSec = Math.floor(new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999).getTime() / 1000);
    return { startSec, endSec };
  }

  if (raw === '30d') {
    return { startSec: Math.floor((nowMs - 30 * 86400000) / 1000), endSec: null };
  }

  return { startSec: null, endSec: null };
}

function buildTimeFilterClause(timeFilter, columnName = 'played_at', referenceDate = null) {
  const { startSec, endSec } = getFilterTimeRange(timeFilter, referenceDate);
  if (startSec != null && endSec != null) {
    return `AND ${columnName} >= ${startSec} AND ${columnName} <= ${endSec}`;
  }
  if (startSec != null) {
    return `AND ${columnName} >= ${startSec}`;
  }
  if (endSec != null) {
    return `AND ${columnName} <= ${endSec}`;
  }
  return '';
}

function getPersonalWrapped(discordId, timeFilter = 'all', includeLastfm = false) {
  const db = getDb();
  const timeClause = buildTimeFilterClause(timeFilter, 'played_at');
  const sourceClause = includeLastfm ? '' : "AND (source IS NULL OR source = 'spotify')";

  const totals = db.prepare(`
    SELECT 
      COUNT(*) as total_scrobbles,
      ROUND(COALESCE(SUM(duration_ms), 0) / 60000.0) as total_minutes
    FROM spotify_scrobbles
    WHERE discord_id = ? ${sourceClause} ${timeClause}
  `).get(discordId);

  const topArtists = db.prepare(`
    SELECT 
      MAX(artist_name) as artist_name,
      COUNT(*) as plays,
      ROUND(SUM(duration_ms) / 60000.0) as minutes
    FROM spotify_scrobbles
    WHERE discord_id = ? ${sourceClause} ${timeClause}
    GROUP BY artist_name COLLATE NOCASE
    ORDER BY minutes DESC, plays DESC
    LIMIT 100
  `).all(discordId);

  const topTracks = db.prepare(`
    SELECT 
      track_id,
      track_name,
      artist_name,
      album_name,
      album_art_url,
      COUNT(*) as plays,
      ROUND(SUM(duration_ms) / 60000.0) as minutes
    FROM spotify_scrobbles
    WHERE discord_id = ? ${sourceClause} ${timeClause}
    GROUP BY track_id, track_name, artist_name
    ORDER BY plays DESC, minutes DESC
    LIMIT 10
  `).all(discordId);

  const artistNames = (topArtists || []).map(a => a.artist_name).filter(Boolean);
  let imageMap = {};
  try {
    imageMap = getArtistImagesBatch(artistNames);
  } catch (e) {}
  for (const a of (topArtists || [])) {
    a.avatar_url = imageMap[a.artist_name.toLowerCase()]?.image_url || null;
  }

  return {
    total_scrobbles: totals ? totals.total_scrobbles : 0,
    total_minutes: totals ? totals.total_minutes : 0,
    top_artists: topArtists || [],
    top_tracks: topTracks || [],
    top_genres: calculateTopGenres(topArtists),
    trends: getListeningTrends(discordId, timeFilter, includeLastfm)
  };
}

function saveArtistImage(artistName, imageUrl, spotifyId = null) {
  if (!artistName || typeof artistName !== 'string') return;
  const trimmed = artistName.trim();
  if (!trimmed) return;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO spotify_artist_images (artist_name, image_url, spotify_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(artist_name) DO UPDATE SET
      image_url = excluded.image_url,
      spotify_id = COALESCE(excluded.spotify_id, spotify_artist_images.spotify_id),
      updated_at = excluded.updated_at
  `).run(trimmed, imageUrl || null, spotifyId || null, now);
}

function getArtistImage(artistName) {
  if (!artistName || typeof artistName !== 'string') return null;
  const trimmed = artistName.trim();
  if (!trimmed) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT artist_name, image_url, spotify_id, updated_at
    FROM spotify_artist_images
    WHERE artist_name = ? COLLATE NOCASE
  `).get(trimmed);
  if (!row) return null;
  return {
    artist_name: row.artist_name,
    image_url: row.image_url,
    spotify_id: row.spotify_id,
    updated_at: row.updated_at
  };
}

function getArtistImagesBatch(artistNames) {
  if (!Array.isArray(artistNames) || artistNames.length === 0) return {};
  const cleanNames = artistNames.filter(n => n && typeof n === 'string').map(n => n.trim());
  if (cleanNames.length === 0) return {};
  const db = getDb();
  const placeholders = cleanNames.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT artist_name, image_url, spotify_id, updated_at
    FROM spotify_artist_images
    WHERE artist_name IN (${placeholders}) COLLATE NOCASE
  `).all(...cleanNames);
  const result = {};
  for (const row of rows) {
    result[row.artist_name.toLowerCase()] = {
      artist_name: row.artist_name,
      image_url: row.image_url,
      spotify_id: row.spotify_id,
      updated_at: row.updated_at
    };
  }
  return result;
}

const getArtistImages = getArtistImagesBatch;

function saveArtistGenres(artistName, genres) {
  if (!artistName || typeof artistName !== 'string') return;
  const db = getDb();
  const genreStr = Array.isArray(genres) ? JSON.stringify(genres) : (typeof genres === 'string' ? genres : '[]');
  db.prepare(`
    INSERT INTO spotify_artist_genres (artist_name, genres, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(artist_name) DO UPDATE SET
      genres = excluded.genres,
      updated_at = excluded.updated_at
  `).run(artistName.trim(), genreStr, Math.floor(Date.now() / 1000));
}

function getArtistGenres(artistNames) {
  if (!Array.isArray(artistNames) || artistNames.length === 0) return {};
  const db = getDb();
  const placeholders = artistNames.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT artist_name, genres FROM spotify_artist_genres
    WHERE artist_name IN (${placeholders}) COLLATE NOCASE
  `).all(...artistNames);
  const result = {};
  for (const row of rows) {
    try {
      result[row.artist_name.toLowerCase()] = JSON.parse(row.genres);
    } catch {
      result[row.artist_name.toLowerCase()] = [];
    }
  }
  return result;
}

function formatGenreName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function calculateTopGenres(artistsWithPlays) {
  if (!Array.isArray(artistsWithPlays) || artistsWithPlays.length === 0) return [];
  const artistNames = artistsWithPlays.map(a => a.artist_name).filter(Boolean);
  if (artistNames.length === 0) return [];
  const genreMap = getArtistGenres(artistNames);

  const genreWeights = {};
  for (const item of artistsWithPlays) {
    const nameLower = (item.artist_name || '').toLowerCase();
    const genres = genreMap[nameLower] || [];
    const weight = Number(item.plays) || 1;
    for (const g of genres) {
      const clean = g.trim().toLowerCase();
      if (!clean) continue;
      genreWeights[clean] = (genreWeights[clean] || 0) + weight;
    }
  }

  const sorted = Object.entries(genreWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) return [];

  const topSum = sorted.reduce((sum, [, count]) => sum + count, 0);

  return sorted.map(([genreKey, count]) => ({
    genre: formatGenreName(genreKey),
    plays: count,
    percentage: topSum > 0 ? Math.max(1, Math.round((count / topSum) * 100)) : 0
  }));
}

function getListeningTrends(discordId = null, timeFilter = 'all', includeLastfm = false) {
  const db = getDb();
  const timeClause = buildTimeFilterClause(timeFilter, 'played_at');
  const sourceClause = includeLastfm ? '' : "AND (source IS NULL OR source = 'spotify')";

  const params = [];
  let userClause = '';
  if (discordId) {
    userClause = 'AND discord_id = ?';
    params.push(discordId);
  }

  const rows = db.prepare(`
    SELECT 
      strftime('%Y-%m-%d', played_at, 'unixepoch') as date,
      COUNT(*) as daily_scrobbles,
      ROUND(SUM(duration_ms) / 3600000.0, 2) as daily_hours,
      ROUND(SUM(duration_ms) / 60000.0, 1) as daily_minutes
    FROM spotify_scrobbles
    WHERE 1=1 ${userClause} ${sourceClause} ${timeClause}
    GROUP BY date
    ORDER BY date ASC
  `).all(...params);

  let cumulativeScrobbles = 0;
  let cumulativeHours = 0;
  return rows.map(r => {
    cumulativeScrobbles += r.daily_scrobbles;
    cumulativeHours = Math.round((cumulativeHours + (r.daily_hours || 0)) * 100) / 100;
    return {
      date: r.date,
      daily_scrobbles: r.daily_scrobbles,
      daily_hours: r.daily_hours || 0,
      daily_minutes: r.daily_minutes || Math.round((r.daily_hours || 0) * 60),
      cumulative_scrobbles: cumulativeScrobbles,
      cumulative_hours: cumulativeHours
    };
  });
}

function getGangWrapped(timeFilter = 'all', includeLastfm = false) {
  const db = getDb();
  const timeClause = buildTimeFilterClause(timeFilter, 'played_at');
  const sourceClause = includeLastfm ? '' : "AND (source IS NULL OR source = 'spotify')";
  const sSourceClause = includeLastfm ? '' : "AND (s.source IS NULL OR s.source = 'spotify')";
  const sTimeClause = buildTimeFilterClause(timeFilter, 's.played_at');

  const totals = db.prepare(`
    SELECT 
      COUNT(*) as total_scrobbles,
      ROUND(COALESCE(SUM(duration_ms), 0) / 3600000.0, 1) as total_hours,
      COUNT(DISTINCT discord_id) as active_members
    FROM spotify_scrobbles
    WHERE 1=1 ${sourceClause} ${timeClause}
  `).get();

  const topSharedArtists = db.prepare(`
    SELECT 
      artist_name,
      COUNT(DISTINCT discord_id) as listeners_count,
      COUNT(*) as total_plays,
      ROUND(SUM(duration_ms) / 60000.0, 1) as total_minutes
    FROM spotify_scrobbles
    WHERE 1=1 ${sourceClause} ${timeClause}
    GROUP BY artist_name
    ORDER BY listeners_count DESC, total_minutes DESC
    LIMIT 10
  `).all();

  const gangAnthem = db.prepare(`
    SELECT 
      track_id,
      track_name,
      artist_name,
      album_name,
      album_art_url,
      COUNT(DISTINCT discord_id) as listeners_count,
      COUNT(*) as total_plays
    FROM spotify_scrobbles
    WHERE 1=1 ${sourceClause} ${timeClause}
    GROUP BY track_id, track_name, artist_name
    ORDER BY total_plays DESC, listeners_count DESC
    LIMIT 1
  `).get();

  const memberRankings = db.prepare(`
    SELECT 
      s.discord_id,
      COALESCE(u.spotify_display_name, d.display_name, d.username, s.discord_id) as spotify_display_name,
      COALESCE(d.display_name, d.username, u.discord_display_name, u.spotify_display_name, s.discord_id) as discord_name,
      COALESCE(u.spotify_avatar_url, d.avatar_url, u.discord_avatar_url) as spotify_avatar_url,
      u.spotify_profile_url,
      COUNT(*) as total_scrobbles,
      ROUND(SUM(s.duration_ms) / 60000.0, 1) as total_minutes
    FROM spotify_scrobbles s
    LEFT JOIN spotify_users u ON s.discord_id = u.discord_id
    LEFT JOIN discord_users d ON s.discord_id = d.discord_id
    WHERE 1=1 ${sSourceClause} ${sTimeClause}
    GROUP BY s.discord_id
    ORDER BY total_minutes DESC
  `).all();

  const sharedNames = (topSharedArtists || []).map(a => a.artist_name).filter(Boolean);
  let gangImageMap = {};
  try {
    gangImageMap = getArtistImagesBatch(sharedNames);
  } catch (e) {}
  for (const a of (topSharedArtists || [])) {
    a.avatar_url = gangImageMap[a.artist_name.toLowerCase()]?.image_url || null;
  }

  const artistsForGenres = (topSharedArtists || []).map(a => ({
    artist_name: a.artist_name,
    plays: a.total_plays,
    minutes: a.total_minutes
  }));

  return {
    totals: totals || { total_scrobbles: 0, total_hours: 0, active_members: 0 },
    top_shared_artists: topSharedArtists || [],
    gang_anthem: gangAnthem || null,
    member_rankings: (memberRankings || []).map(m => ({
      ...m,
      display_name: m.discord_name || m.spotify_display_name || m.discord_id
    })),
    top_genres: calculateTopGenres(artistsForGenres),
    trends: getListeningTrends(null, timeFilter, includeLastfm)
  };
}

function searchArtistLeaderboard(query, includeLastfm = false) {
  if (!query || typeof query !== 'string') return [];
  const db = getDb();
  const sanitized = `%${query.trim()}%`;
  const sSourceClause = includeLastfm ? '' : "AND (s.source IS NULL OR s.source = 'spotify')";

  const rows = db.prepare(`
    SELECT 
      s.discord_id,
      COALESCE(u.spotify_display_name, d.display_name, d.username, s.discord_id) as spotify_display_name,
      COALESCE(d.display_name, d.username, u.discord_display_name, u.spotify_display_name, s.discord_id) as discord_name,
      COALESCE(u.spotify_avatar_url, d.avatar_url, u.discord_avatar_url) as spotify_avatar_url,
      u.spotify_profile_url,
      COUNT(*) as play_count,
      ROUND(SUM(s.duration_ms) / 60000.0, 1) as total_minutes
    FROM spotify_scrobbles s
    LEFT JOIN spotify_users u ON s.discord_id = u.discord_id
    LEFT JOIN discord_users d ON s.discord_id = d.discord_id
    WHERE s.artist_name LIKE ? COLLATE NOCASE ${sSourceClause}
    GROUP BY s.discord_id
    ORDER BY total_minutes DESC, play_count DESC
  `).all(sanitized);

  return rows.map((r, idx) => ({
    ...r,
    display_name: r.discord_name || r.spotify_display_name || r.discord_id,
    rank: idx + 1,
    is_top_fan: idx === 0
  }));
}

// ==============================================================================
// DYNAMIC TABLES: SEED & HELPER METHODS
// ==============================================================================

function seedDynamicDefaults(db) {
  try {
    // 1. Quotes
    const quoteCount = db.prepare('SELECT COUNT(*) as count FROM quotes').get()?.count || 0;
    if (quoteCount === 0 && Array.isArray(DEFAULT_QUOTES)) {
      const stmt = db.prepare('INSERT INTO quotes (quote, author, enabled, created_at) VALUES (?, ?, ?, ?)');
      const now = Date.now();
      for (const q of DEFAULT_QUOTES) {
        if (q && q.quote) {
          stmt.run(q.quote, q.author || '', q.enabled !== false ? 1 : 0, now);
        }
      }
    }

    // 2. Council Members
    const councilCount = db.prepare('SELECT COUNT(*) as count FROM council_members').get()?.count || 0;
    if (councilCount === 0 && Array.isArray(DEFAULT_COUNCIL)) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO council_members 
        (id, name, handle, role, glow_color, image, bio, traits, avatar_emoji, display_order, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = Date.now();
      DEFAULT_COUNCIL.forEach((m, idx) => {
        if (m && m.id) {
          stmt.run(
            m.id,
            m.name || '',
            m.handle || '',
            m.role || '',
            m.glowColor || 'purple',
            m.image || '',
            m.bio || '',
            JSON.stringify(m.traits || []),
            m.avatarEmoji || '',
            idx,
            m.enabled !== false ? 1 : 0,
            now
          );
        }
      });
    }

    // 3. Hall of Fame
    const hofCount = db.prepare('SELECT COUNT(*) as count FROM hall_of_fame').get()?.count || 0;
    if (hofCount === 0 && Array.isArray(DEFAULT_HALL_OF_FAME)) {
      const stmt = db.prepare(`
        INSERT INTO hall_of_fame (title, recipient, handle, badge, description, color, display_order, enabled, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      const now = Date.now();
      DEFAULT_HALL_OF_FAME.forEach((h, idx) => {
        stmt.run(h.title || '', h.recipient || '', h.handle || '', h.badge || '', h.desc || '', h.color || 'purple', idx, now);
      });
    }

    // 4. Lore
    const loreCount = db.prepare('SELECT COUNT(*) as count FROM lore_milestones').get()?.count || 0;
    if (loreCount === 0 && Array.isArray(DEFAULT_LORE)) {
      const stmt = db.prepare(`
        INSERT INTO lore_milestones (season, title, description, display_order, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const now = Date.now();
      DEFAULT_LORE.forEach((l, idx) => {
        stmt.run(l.season || '', l.title || '', l.desc || '', idx, now);
      });
    }

    // 5. Rules
    const rulesCount = db.prepare('SELECT COUNT(*) as count FROM rules').get()?.count || 0;
    if (rulesCount === 0 && Array.isArray(DEFAULT_RULES)) {
      const stmt = db.prepare(`
        INSERT INTO rules (num, title, description, display_order, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const now = Date.now();
      DEFAULT_RULES.forEach((r, idx) => {
        stmt.run(r.num || '', r.title || '', r.desc || '', idx, now);
      });
    }

    // 6. Game Catalog
    const gameCount = db.prepare('SELECT COUNT(*) as count FROM game_catalog').get()?.count || 0;
    if (gameCount === 0 && Array.isArray(DEFAULT_GAMES)) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO game_catalog (name, category, tags, keywords, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const now = Date.now();
      DEFAULT_GAMES.forEach(g => {
        stmt.run(g.name, g.category, JSON.stringify(g.tags || []), JSON.stringify(g.keywords || []), now);
      });
    }

    // 7. Category Emojis
    const emojiCount = db.prepare('SELECT COUNT(*) as count FROM category_emojis').get()?.count || 0;
    if (emojiCount === 0 && DEFAULT_EMOJIS) {
      const stmt = db.prepare('INSERT OR IGNORE INTO category_emojis (emoji, category) VALUES (?, ?)');
      for (const [emoji, cat] of Object.entries(DEFAULT_EMOJIS)) {
        stmt.run(emoji, cat);
      }
    }

    // 8. Feature Access: Ensure Barb is authorized, and remove blocked IDs
    const blockedIds = config.BLOCKED_FEATURE_USER_IDS || ['676125827368484933'];
    for (const blockedId of blockedIds) {
      db.prepare('DELETE FROM feature_access WHERE discord_id = ?').run(blockedId);
    }
    const barbId = config.ADMIN_DISCORD_USER_ID || '735152588801966132';
    db.prepare(`
      INSERT OR IGNORE INTO feature_access (feature_name, discord_id, granted_by, created_at)
      VALUES ('wrapped', ?, 'system', ?)
    `).run(barbId, Date.now());
  } catch (err) {
    console.warn('[Db Seed] Warning seeding dynamic defaults:', err.message);
  }
}

function getQuotes() {
  const db = getDb();
  return db.prepare('SELECT id, quote, author, author_id, added_by, enabled, created_at FROM quotes WHERE enabled = 1 ORDER BY id ASC').all();
}

function insertQuote({ quote, text, author, author_id = null, discord_id = null, added_by = null }) {
  const db = getDb();
  const quoteText = quote || text;
  const authorDiscordId = author_id || discord_id;
  const res = db.prepare(`
    INSERT INTO quotes (quote, author, author_id, added_by, enabled, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(quoteText, author, authorDiscordId, added_by, Date.now());
  return { id: res.lastInsertRowid, quote: quoteText, author, author_id: authorDiscordId, added_by };
}

function deleteQuote(id) {
  const db = getDb();
  return db.prepare('DELETE FROM quotes WHERE id = ?').run(id).changes > 0;
}

function getCouncilMembers() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM council_members WHERE enabled = 1 ORDER BY display_order ASC').all();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    handle: r.handle,
    role: r.role,
    glowColor: r.glow_color,
    image: r.image,
    bio: r.bio,
    avatarEmoji: r.avatar_emoji,
    traits: (() => {
      try { return JSON.parse(r.traits); } catch { return []; }
    })()
  }));
}

function upsertCouncilMember(member) {
  const db = getDb();
  const traitsJson = Array.isArray(member.traits) ? JSON.stringify(member.traits) : (member.traits || '[]');
  db.prepare(`
    INSERT INTO council_members (id, name, handle, role, glow_color, image, bio, traits, avatar_emoji, display_order, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      handle = excluded.handle,
      role = excluded.role,
      glow_color = excluded.glow_color,
      image = excluded.image,
      bio = excluded.bio,
      traits = excluded.traits,
      avatar_emoji = excluded.avatar_emoji,
      display_order = COALESCE(excluded.display_order, council_members.display_order),
      enabled = COALESCE(excluded.enabled, council_members.enabled),
      updated_at = excluded.updated_at
  `).run(
    member.id,
    member.name,
    member.handle,
    member.role,
    member.glowColor || member.glow_color || 'purple',
    member.image || '',
    member.bio || '',
    traitsJson,
    member.avatarEmoji || member.avatar_emoji || '',
    member.display_order || 0,
    member.enabled !== false ? 1 : 0,
    Date.now()
  );
}

function getHallOfFame() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM hall_of_fame WHERE enabled = 1 ORDER BY display_order ASC').all();
  return rows.map(r => ({
    title: r.title,
    recipient: r.recipient,
    handle: r.handle,
    badge: r.badge,
    desc: r.description,
    color: r.color
  }));
}

function getLoreMilestones() {
  const db = getDb();
  return db.prepare('SELECT season, title, description as desc FROM lore_milestones ORDER BY display_order ASC').all();
}

function getRules() {
  const db = getDb();
  return db.prepare('SELECT num, title, description as desc FROM rules ORDER BY display_order ASC').all();
}

function getGameCatalog() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM game_catalog ORDER BY id ASC').all();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
    keywords: (() => { try { return JSON.parse(r.keywords); } catch { return []; } })()
  }));
}

function insertGameCatalog({ name, game_name, category, tags = [], keywords = [] }) {
  const db = getDb();
  const finalName = name || game_name;
  const tagsJson = JSON.stringify(tags);
  const keywordsJson = JSON.stringify(keywords);
  return db.prepare(`
    INSERT OR REPLACE INTO game_catalog (name, category, tags, keywords, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(finalName, category, tagsJson, keywordsJson, Date.now());
}

function getCategoryEmojis() {
  const db = getDb();
  const rows = db.prepare('SELECT emoji, category FROM category_emojis').all();
  const map = {};
  rows.forEach(r => { map[r.emoji] = r.category; });
  return map;
}

function hasDbFeatureAccess(featureName, discordId) {
  if (!featureName || !discordId) return false;
  // Barb is ALWAYS authorized
  const barbId = config.ADMIN_DISCORD_USER_ID || '735152588801966132';
  if (discordId === barbId || discordId === '735152588801966132') return true;
  // Blocked users are explicitly not authorized
  const blockedIds = config.BLOCKED_FEATURE_USER_IDS || ['676125827368484933'];
  if (blockedIds.includes(String(discordId))) return false;

  const db = getDb();
  const row = db.prepare('SELECT 1 FROM feature_access WHERE feature_name = ? AND discord_id = ?').get(featureName, String(discordId));
  return !!row;
}

function getDbFeatureAccessList(featureName) {
  const db = getDb();
  return db.prepare('SELECT discord_id, granted_by, created_at FROM feature_access WHERE feature_name = ?').all(featureName);
}

function grantDbFeatureAccess(featureName, discordId, grantedBy = 'admin') {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO feature_access (feature_name, discord_id, granted_by, created_at)
    VALUES (?, ?, ?, ?)
  `).run(featureName, String(discordId), String(grantedBy), Date.now());
}

function revokeDbFeatureAccess(featureName, discordId) {
  const db = getDb();
  // Prevent revoking Barb
  const barbId = config.ADMIN_DISCORD_USER_ID || '735152588801966132';
  if (discordId === barbId || discordId === '735152588801966132') return false;
  return db.prepare('DELETE FROM feature_access WHERE feature_name = ? AND discord_id = ?').run(featureName, String(discordId)).changes > 0;
}

module.exports = {
  initDb,
  getDb,
  insertClip,
  updateClipCategory,
  getClipByMessageId,
  getClips,
  insertImage,
  getImages,
  getImageById,
  getClipById,
  updateImageVaultBlob,
  updateClipVaultBlob,
  getStats,
  getPublicClipCount,
  addVoiceSeconds,
  getPublicVcHours,
  getVcStatsRaw,
  deleteClip,
  deleteImage,
  updateClipCaption,
  formatClipRow,
  formatImageRow,
  upsertSpotifyUser,
  getSpotifyUser,
  getAllSpotifyUsers,
  deleteSpotifyUser,
  updateSpotifyTokens,
  updateSpotifyLastPolled,
  upsertDiscordUser,
  upsertDiscordUsersBatch,
  getDiscordUser,
  insertScrobbles,
  getPersonalWrapped,
  getGangWrapped,
  searchArtistLeaderboard,
  saveArtistImage,
  getArtistImage,
  getArtistImagesBatch,
  getArtistImages,
  saveArtistGenres,
  getArtistGenres,
  formatGenreName,
  calculateTopGenres,
  getListeningTrends,
  getQuotes,
  insertQuote,
  deleteQuote,
  getCouncilMembers,
  upsertCouncilMember,
  getHallOfFame,
  getLoreMilestones,
  getRules,
  getGameCatalog,
  insertGameCatalog,
  getCategoryEmojis,
  hasDbFeatureAccess,
  getDbFeatureAccessList,
  grantDbFeatureAccess,
  revokeDbFeatureAccess,
  getFilterTimeRange,
  buildTimeFilterClause,
  closeDb
};

