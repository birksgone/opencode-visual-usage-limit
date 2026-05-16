// background.js — opencode Go-Zen Usage Monitor (Manifest V3 Service Worker)

const DEFAULT_CONFIG = {
  usageUrl: 'https://opencode.ai/go',
  refreshIntervalMinutes: 30,
};

// Extract workspace ID from a URL like https://opencode.ai/workspace/WRK_ID/go
function extractWorkspaceId(url) {
  const m = url.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

// Try to discover the user's workspace URL from cookies or redirects
async function discoverWorkspaceUrl() {
  // Method 1: Check cookies for workspace ID
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'opencode.ai' });
    for (const cookie of cookies) {
      const m = cookie.value.match(/(wrk_[A-Za-z0-9]+)/);
      if (m) {
        const url = `https://opencode.ai/workspace/${m[1]}/go`;
        console.log('[OpenCode] Discovered URL from cookie:', url);
        await chrome.storage.local.set({ discoveredUrl: url });
        return url;
      }
    }
  } catch (err) {
    console.warn('[OpenCode] Cookie check failed:', err);
  }

  // Method 2: Follow redirects from /go
  try {
    const res = await fetch(DEFAULT_CONFIG.usageUrl, {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
    });

    const finalUrl = res.url;
    console.log('[OpenCode] Final URL after fetch:', finalUrl);

    // Check if we got redirected to a workspace URL
    const workspaceId = extractWorkspaceId(finalUrl);
    if (workspaceId) {
      const url = `https://opencode.ai/workspace/${workspaceId}/go`;
      await chrome.storage.local.set({ discoveredUrl: url });
      return url;
    }

    // Method 3: Search HTML for workspace references
    const html = await res.text();
    const htmlMatch = html.match(/(wrk_[A-Za-z0-9]+)/);
    if (htmlMatch) {
      const url = `https://opencode.ai/workspace/${htmlMatch[1]}/go`;
      console.log('[OpenCode] Discovered URL from HTML:', url);
      await chrome.storage.local.set({ discoveredUrl: url });
      return url;
    }

    return null;
  } catch (err) {
    console.error('[OpenCode] Discovery failed:', err);
    return null;
  }
}

// Remaining % → color
function getStatusColor(remainingPct) {
  if (remainingPct > 80) return '#22c55e';
  if (remainingPct > 60) return '#84cc16';
  if (remainingPct > 40) return '#eab308';
  if (remainingPct > 20) return '#f97316';
  return '#ef4444';
}

// Draw circular progress icon using OffscreenCanvas
async function drawIcon(remainingPct, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const color = getStatusColor(remainingPct);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const lw = Math.max(2, size * 0.13);

  ctx.clearRect(0, 0, size, size);

  // Track (used portion — dark)
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Arc (remaining portion — colored)
  if (remainingPct > 0) {
    const start = -Math.PI / 2;
    const end = start + (remainingPct / 100) * Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.stroke();
  }

  // Center percentage text (only at larger sizes for legibility)
  if (size >= 48) {
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(size * 0.27)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(remainingPct)}`, cx, cy);
  }

  return ctx.getImageData(0, 0, size, size);
}

async function updateIcon(remainingPct) {
  try {
    const imageData = {
      32: await drawIcon(remainingPct, 32),
      128: await drawIcon(remainingPct, 128),
    };
    await chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn('[OpenCode] setIcon failed:', e);
  }
  chrome.action.setBadgeBackgroundColor({ color: getStatusColor(remainingPct) });
}

function formatBadgeText(zenBalance) {
  if (zenBalance == null || isNaN(zenBalance)) return '';
  const n = Number(zenBalance);
  if (n >= 100) return `$${Math.floor(n)}`;
  if (n >= 10)  return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`.substring(0, 5);
}

// ── SolidJS hydration parser ───────────────────────────────────────────────

function parseSolidJSUsage(html) {
  // Extract rollingUsage (5H)
  const rollingMatch = html.match(
    /rollingUsage:\$R\[\d+\]=\{status:"([^"]+)",resetInSec:(\d+),usagePercent:(\d+)\}/
  );
  // Extract weeklyUsage (7D)
  const weeklyMatch = html.match(
    /weeklyUsage:\$R\[\d+\]=\{status:"([^"]+)",resetInSec:(\d+),usagePercent:(\d+)\}/
  );
  // Extract monthlyUsage (for reference)
  const monthlyMatch = html.match(
    /monthlyUsage:\$R\[\d+\]=\{status:"([^"]+)",resetInSec:(\d+),usagePercent:(\d+)\}/
  );
  // Extract balance (Zen credit, stored in 10^-8 USD)
  const balanceMatch = html.match(/balance:(\d+)(?:,|})/);

  const now = Date.now();

  const result = {
    source: 'solidjs_hydration',
  };

  if (rollingMatch) {
    const usagePercent = Number(rollingMatch[3]);
    const resetInSec = Number(rollingMatch[2]);
    result.rolling = {
      used: usagePercent,
      limit: 100,
      remaining: Math.max(0, 100 - usagePercent),
      resetAt: now + resetInSec * 1000,
    };
  }

  if (weeklyMatch) {
    const usagePercent = Number(weeklyMatch[3]);
    const resetInSec = Number(weeklyMatch[2]);
    result.weekly = {
      used: usagePercent,
      limit: 100,
      remaining: Math.max(0, 100 - usagePercent),
      resetAt: now + resetInSec * 1000,
    };
  }

  if (monthlyMatch) {
    const usagePercent = Number(monthlyMatch[3]);
    const resetInSec = Number(monthlyMatch[2]);
    result.monthly = {
      used: usagePercent,
      limit: 100,
      remaining: Math.max(0, 100 - usagePercent),
      resetAt: now + resetInSec * 1000,
    };
  }

  if (balanceMatch) {
    const rawBalance = Number(balanceMatch[1]);
    result.zen = {
      balance: rawBalance / 1e8,
      rawBalance,
    };
  }

  // Fallback: if we got nothing, return unparsed hint
  if (!result.rolling && !result.weekly && !result.zen) {
    return {
      source: 'unparsed',
      htmlLength: html.length,
      htmlPreview: html.slice(0, 800),
    };
  }

  return result;
}

// ── Main fetch & update ──────────────────────────────────────────────────────

async function fetchAndUpdate() {
  const { config, discoveredUrl } = await chrome.storage.local.get(['config', 'discoveredUrl']);
  let url = config?.usageUrl || discoveredUrl;

  // If no workspace URL is known, try to discover it from cookies or redirects
  if (!url) {
    const newUrl = await discoverWorkspaceUrl();
    if (newUrl) {
      url = newUrl;
    } else {
      // Can't discover workspace — user needs to log in or set URL manually
      await chrome.storage.local.set({
        error: 'workspace_not_found',
        lastUpdated: Date.now(),
      });
      chrome.action.setBadgeText({ text: '?' });
      chrome.action.setBadgeBackgroundColor({ color: '#f97316' });
      return;
    }
  }

  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
    });

    if (res.status === 401 || res.status === 403) {
      await chrome.storage.local.set({ error: 'not_logged_in', lastUpdated: Date.now() });
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      return;
    }

    const html = await res.text();
    const usageData = parseSolidJSUsage(html);

    if (usageData.source === 'unparsed') {
      console.log('[OpenCode] Could not parse usage data from', url);
      await chrome.storage.local.set({
        error: 'workspace_not_found',
        lastUpdated: Date.now(),
      });
      chrome.action.setBadgeText({ text: '?' });
      chrome.action.setBadgeBackgroundColor({ color: '#f97316' });
      return;
    }

    await chrome.storage.local.set({ usageData, error: null, lastUpdated: Date.now() });

    // Update icon (rolling / 5h remaining %)
    const rollingRemaining = usageData?.rolling?.remaining;
    if (rollingRemaining != null) {
      await updateIcon(rollingRemaining);
    }

    // Update badge (Zen credit)
    chrome.action.setBadgeText({ text: formatBadgeText(usageData?.zen?.balance) });

  } catch (err) {
    console.error('[OpenCode] Fetch error:', err);
    await chrome.storage.local.set({ error: err.message, lastUpdated: Date.now() });
  }
}

// ── Alarm helpers ────────────────────────────────────────────────────────────

async function resetAlarm() {
  const { config } = await chrome.storage.local.get('config');
  const interval = config?.refreshIntervalMinutes ?? DEFAULT_CONFIG.refreshIntervalMinutes;

  await chrome.alarms.clear('refresh');
  chrome.alarms.create('refresh', {
    delayInMinutes: 0.2,
    periodInMinutes: interval,
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  resetAlarm();
  fetchAndUpdate();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh') fetchAndUpdate();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.action === 'refresh') {
    fetchAndUpdate().then(() => {
      chrome.storage.local.get(['usageData', 'error', 'lastUpdated'], reply);
    });
    return true; // keep channel open for async reply
  }
  if (msg.action === 'setInterval') {
    const minutes = Number(msg.minutes);
    if (minutes >= 1 && minutes <= 1440) {
      chrome.storage.local.get('config', ({ config }) => {
        const newConfig = { ...(config || {}), refreshIntervalMinutes: minutes };
        chrome.storage.local.set({ config: newConfig }, () => {
          resetAlarm();
          reply({ success: true, interval: minutes });
        });
      });
      return true;
    }
    reply({ success: false, error: 'invalid interval' });
    return true;
  }
  if (msg.action === 'setWorkspaceUrl') {
    const url = msg.url;
    // Empty string = clear manual override, go back to auto-discovery
    if (!url) {
      chrome.storage.local.get('config', ({ config }) => {
        const newConfig = { ...(config || {}) };
        delete newConfig.usageUrl;
        chrome.storage.local.set({ config: newConfig });
        chrome.storage.local.remove('discoveredUrl', () => {
          reply({ success: true });
        });
      });
      return true;
    }
    if (url.startsWith('https://opencode.ai/workspace/')) {
      chrome.storage.local.get('config', ({ config }) => {
        const newConfig = { ...(config || {}), usageUrl: url };
        chrome.storage.local.set({ config: newConfig, discoveredUrl: url }, () => {
          fetchAndUpdate();
          reply({ success: true, url });
        });
      });
      return true;
    }
    reply({ success: false, error: 'invalid URL format' });
    return true;
  }
  if (msg.action === 'openLogin') {
    chrome.tabs.create({ url: 'https://opencode.ai/go' });
    reply({ success: true });
    return true;
  }
});
