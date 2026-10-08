const test = require('node:test');
const assert = require('node:assert');
const { ActivityType } = require('discord.js');
const {
  parseSpotifyPresence,
  handlePresenceUpdate,
  presenceLiveStore
} = require('../src/discordSpotifyTracker');

// Future Discord rich presence, cross-client music tracker, or auto-scrobbler updates belong here.

test('Discord Spotify Tracker: activity parsing and presence updates with automatic >=30s scrobbling on track stop', () => {
  presenceLiveStore.clear();

  // 1. Parse presence
  const mockPresence = {
    userId: 'user_456',
    member: {
      displayName: 'Barb',
      user: {
        username: 'barb',
        displayName: 'Barb',
        displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/456/barb.png'
      }
    },
    activities: [
      {
        name: 'Spotify',
        type: ActivityType.Listening,
        syncId: 'spotify_track_789',
        details: 'Passenger',
        state: 'Deftones, Maynard James Keenan',
        assets: {
          largeImage: 'spotify:ab67616d0000b273passengerhash',
          largeText: 'White Pony'
        },
        timestamps: {
          start: new Date(Date.now() - 35000),
          end: new Date(Date.now() + 200000)
        }
      }
    ]
  };

  const parsed = parseSpotifyPresence(mockPresence);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.discord_id, 'user_456');
  assert.strictEqual(parsed.track_name, 'Passenger');
  assert.strictEqual(parsed.artist_name, 'Deftones, Maynard James Keenan');
  assert.strictEqual(parsed.album_art_url, 'https://i.scdn.co/image/ab67616d0000b273passengerhash');
  assert.strictEqual(parsed.is_playing, true);

  // 2. Presence start & stop with auto-scrobble on >=30s
  const scrobbled = [];
  const mockDb = {
    insertScrobbles: (userId, tracks) => {
      scrobbled.push({ userId, tracks });
    }
  };

  const activePresence = {
    userId: 'scrobble_user_1',
    member: {
      displayName: 'Scrobbler',
      user: { username: 'scrobbler', displayAvatarURL: () => 'https://avatar.png' }
    },
    activities: [
      {
        name: 'Spotify',
        type: ActivityType.Listening,
        syncId: 'track_123',
        details: 'My Own Summer',
        state: 'Deftones',
        assets: { largeImage: 'spotify:img123', largeText: 'Around the Fur' },
        timestamps: {
          start: new Date(Date.now() - 40000),
          end: new Date(Date.now() + 180000)
        }
      }
    ]
  };

  // User starts listening
  handlePresenceUpdate(null, activePresence, mockDb);
  assert.strictEqual(presenceLiveStore.has('scrobble_user_1'), true);
  assert.strictEqual(scrobbled.length, 0);

  // User stops listening
  const pausedPresence = {
    userId: 'scrobble_user_1',
    member: activePresence.member,
    activities: []
  };
  handlePresenceUpdate(activePresence, pausedPresence, mockDb);

  assert.strictEqual(presenceLiveStore.has('scrobble_user_1'), false);
  assert.strictEqual(scrobbled.length, 1);
  assert.strictEqual(scrobbled[0].userId, 'scrobble_user_1');
  assert.strictEqual(scrobbled[0].tracks[0].track_name, 'My Own Summer');

  presenceLiveStore.clear();
});

test('Discord Spotify Tracker: multi-guild prioritization preventing presence flapping across guilds', () => {
  presenceLiveStore.clear();

  const primaryGuildId = '1389232967271972914';
  const secondaryGuildId = '1061058726137692332';
  const memberId = 'multi_guild_user_1';

  const mockClient = {
    guilds: {
      cache: new Map([
        [primaryGuildId, {
          id: primaryGuildId,
          members: { cache: new Map([[memberId, { id: memberId }]]) }
        }],
        [secondaryGuildId, {
          id: secondaryGuildId,
          members: { cache: new Map([[memberId, { id: memberId }]]) }
        }]
      ])
    }
  };

  const primaryPresence = {
    userId: memberId,
    guild: { id: primaryGuildId },
    client: mockClient,
    member: {
      displayName: 'DualUser',
      user: { username: 'dualuser', displayAvatarURL: () => 'https://avatar.png' }
    },
    activities: [
      {
        name: 'Spotify',
        type: ActivityType.Listening,
        syncId: 'track_primary',
        details: 'Song from Primary',
        state: 'Primary Artist',
        assets: { largeImage: 'spotify:primary_art', largeText: 'Primary Album' },
        timestamps: { start: new Date(), end: new Date(Date.now() + 180000) }
      }
    ]
  };

  // Primary guild event registers the song
  handlePresenceUpdate(null, primaryPresence, { insertScrobbles: () => {} });
  assert.strictEqual(presenceLiveStore.has(memberId), true);
  assert.strictEqual(presenceLiveStore.get(memberId).track_name, 'Song from Primary');

  // Secondary guild event with empty activities must NOT overwrite primary guild active song
  const secondaryEmptyPresence = {
    userId: memberId,
    guild: { id: secondaryGuildId },
    client: mockClient,
    member: primaryPresence.member,
    activities: []
  };
  handlePresenceUpdate(primaryPresence, secondaryEmptyPresence, { insertScrobbles: () => {} });

  assert.strictEqual(presenceLiveStore.has(memberId), true);
  assert.strictEqual(presenceLiveStore.get(memberId).track_name, 'Song from Primary');

  presenceLiveStore.clear();
});
