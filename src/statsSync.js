const fs = require('fs');
const path = require('path');
const { getPublicClipCount, getPublicVcHours } = require('./db');
let vcTracker = null;
try {
  vcTracker = require('./vcTracker');
} catch (e) {
  // Graceful fallback if tracker module not available in isolated unit tests
}

function syncPublicStatsFile(customPath) {
  try {
    const count = getPublicClipCount();

    let inFlight = 0;
    if (vcTracker && typeof vcTracker.flushActiveVoiceSessions === 'function') {
      vcTracker.flushActiveVoiceSessions();
    }
    const vcHours = getPublicVcHours(inFlight);

    const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
    const targetPath = customPath || (isTest 
      ? path.join(__dirname, '../tests/test_stats.json')
      : path.join(__dirname, '../../assets/data/stats.json'));
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let existingData = {};
    if (fs.existsSync(targetPath)) {
      try {
        existingData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      } catch (e) {
        existingData = {};
      }
    }

    const payload = {
      ...existingData,
      clipCount: count,
      vcHours: vcHours,
      lastUpdated: Date.now()
    };

    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  } catch (err) {
    console.error('[StatsSync] Error writing public stats:', err.message);
    return null;
  }
}

module.exports = { syncPublicStatsFile };
