// Sends console commands to the IAU Minecraft server through the Pterodactyl client API.
// The API returns no console output: 204 means the command was queued, nothing more.

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const ACTIONS = new Set(['add', 'remove', 'list']);

function isValidMinecraftName(name) {
  return typeof name === 'string' && USERNAME_RE.test(name);
}

// Returns { ok, status, error }. Never throws; the key never appears in the result.
async function sendWhitelistCommand(config, action, name) {
  if (!ACTIONS.has(action)) return { ok: false, error: 'invalid-action' };
  if (action !== 'list' && !isValidMinecraftName(name)) return { ok: false, error: 'invalid-name' };
  if (!config.IAU_PANEL_API_KEY) return { ok: false, error: 'no-key' };

  const command = action === 'list' ? 'whitelist list' : `whitelist ${action} ${name}`;
  const url = `${config.IAU_PANEL_URL}/api/client/servers/${config.IAU_SERVER_ID}/command`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.IAU_PANEL_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(10_000)
    });
    return { ok: res.status === 204, status: res.status };
  } catch (err) {
    return { ok: false, error: 'network' };
  }
}

module.exports = { isValidMinecraftName, sendWhitelistCommand };
