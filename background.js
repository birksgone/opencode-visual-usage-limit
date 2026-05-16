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

// Used % → color (icon bars)
function getStatusColor(usedPct) {
  if (usedPct < 20) return '#22c55e';
  if (usedPct < 40) return '#84cc16';
  if (usedPct < 60) return '#eab308';
  if (usedPct < 80) return '#f97316';
  return '#ef4444';
}

// Zen balance → badge color
function getZenBadgeColor(balance) {
  if (balance == null || isNaN(balance)) return '#64748b';
  const n = Number(balance);
  if (n < 2) return '#ef4444';   // red — critically low
  if (n < 5) return '#f97316';   // orange — running low
  return '#22c55e';              // green — healthy
}

const BLOCK_COUNT = 5;  // 5 discrete blocks per bar

function drawUsedBar(ctx, usedPct, x, y, w, h) {
  const blockW = Math.floor(w / BLOCK_COUNT);
  const gap = 1;  // 1px gap between blocks
  const drawW = Math.max(1, blockW - gap);

  // Determine how many blocks to fill (1–5, matching 20% color tiers)
  const filledBlocks = Math.min(BLOCK_COUNT, Math.ceil(usedPct / 20));
  const color = getStatusColor(usedPct);

  for (let i = 0; i < BLOCK_COUNT; i++) {
    const bx = x + i * blockW;
    if (i < filledBlocks) {
      ctx.fillStyle = color;
    } else {
      ctx.fillStyle = '#1e1e1e';  // unused — dark
    }
    ctx.fillRect(bx, y, drawW, h);
  }
}

// Draw dual-bar icon: top = 5H used, bottom = Zen balance text (if enabled) or 7D used
async function drawIcon(rollingUsed, weeklyUsed, zenBalance, showZenBadge, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background — fill entire canvas, no wasted margin
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, size, size);

  const margin = Math.max(1, Math.round(size * 0.03));  // minimal side margin
  const gap = 1;  // 1px gap between bars
  const barW = size - margin * 2;

  let topH, bottomH;
  if (showZenBadge) {
    // 30% / 70% split when Zen text is shown (larger bottom for readability)
    topH = Math.max(2, Math.round((size - margin * 2 - gap) * 0.30));
    bottomH = size - margin * 2 - gap - topH;
  } else {
    // 50% / 50% split when both are bars
    topH = bottomH = Math.max(2, Math.round((size - margin * 2 - gap) / 2));
  }

  const y1 = margin;
  const y2 = margin + topH + gap;

  // Top bar: 5H Rolling used %
  drawUsedBar(ctx, rollingUsed, margin, y1, barW, topH);

  // Bottom bar: Zen balance text (when enabled) or 7D Weekly used %
  if (showZenBadge) {
    const color = getZenBadgeColor(zenBalance);
    ctx.fillStyle = color;
    ctx.fillRect(margin, y2, barW, bottomH);

    // Draw balance text — use full height, no vertical padding
    const text = formatBadgeText(zenBalance);
    if (text) {
      ctx.fillStyle = '#000000';
      // Scale font to fill the bar height
      ctx.font = `bold ${Math.max(8, bottomH)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Shift baseline down 1px to visually balance (font ascender bias)
      ctx.fillText(text, margin + barW / 2, y2 + bottomH / 2 + 1);
    }
  } else {
    drawUsedBar(ctx, weeklyUsed, margin, y2, barW, bottomH);
  }

  return ctx.getImageData(0, 0, size, size);
}

async function updateIcon(rollingUsed, weeklyUsed, zenBalance, showZenBadge) {
  try {
    const imageData = {
      32: await drawIcon(rollingUsed, weeklyUsed, zenBalance, showZenBadge, 32),
      128: await drawIcon(rollingUsed, weeklyUsed, zenBalance, showZenBadge, 128),
    };
    await chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn('[OpenCode] setIcon failed:', e);
  }
}

function formatBadgeText(zenBalance) {
  if (zenBalance == null || isNaN(zenBalance)) return '';
  const n = Number(zenBalance);
  // Keep it ≤ 4 characters so Chrome draws a compact pill
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;   // e.g. "2k" for $2,000
  if (n >= 100)  return `${Math.floor(n)}`;           // e.g. "123"
  if (n >= 10)   return `${Math.floor(n)}`;           // e.g. "12"
  return `${n.toFixed(1)}`;                            // e.g. "5.1", "0.5"
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
      return;
    }

    await chrome.storage.local.set({ usageData, error: null, lastUpdated: Date.now() });

    // Update icon: top bar = 5H, bottom bar = Zen color (if enabled) or 7D
    const showZenBadge = config?.showZenBadge !== false;
    const rollingUsed = usageData?.rolling?.used;
    const weeklyUsed = usageData?.weekly?.used;
    const zenBalance = usageData?.zen?.balance;

    if (rollingUsed != null) {
      await updateIcon(rollingUsed, weeklyUsed, zenBalance, showZenBadge);
    }

    // No badge text anymore — everything is inside the icon image
    chrome.action.setBadgeText({ text: '' });

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
  if (msg.action === 'setZenBadge') {
    const show = Boolean(msg.show);
    chrome.storage.local.get('config', ({ config }) => {
      const newConfig = { ...(config || {}), showZenBadge: show };
      chrome.storage.local.set({ config: newConfig }, () => {
        // Refresh badge immediately
        fetchAndUpdate();
        reply({ success: true, show });
      });
    });
    return true;
  }
});
