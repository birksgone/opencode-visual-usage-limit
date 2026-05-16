// popup.js — opencode Go-Zen Usage Monitor popup renderer

const FILLED = '▰';
const EMPTY  = '▱';
const BAR_LEN = 10;

function makeBar(usedPct) {
  const n = Math.max(0, Math.min(BAR_LEN, Math.round((usedPct / 100) * BAR_LEN)));
  return FILLED.repeat(n) + EMPTY.repeat(BAR_LEN - n);
}

function colorClass(usedPct) {
  if (usedPct < 20) return 'c-green';
  if (usedPct < 40) return 'c-lime';
  if (usedPct < 60) return 'c-yellow';
  if (usedPct < 80) return 'c-orange';
  return 'c-red';
}

function dotColor(usedPct) {
  if (usedPct < 20) return '#22c55e';
  if (usedPct < 40) return '#84cc16';
  if (usedPct < 60) return '#eab308';
  if (usedPct < 80) return '#f97316';
  return '#ef4444';
}

// ms until reset → "Xd Xh Xm"
function fmtCountdown(resetAt) {
  if (!resetAt) return null;
  const ms = new Date(resetAt).getTime() - Date.now();
  if (isNaN(ms) || ms <= 0) return 'Reset soon';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `Reset in ${d}d ${h}h ${m}m`;
  if (h > 0) return `Reset in ${h}h ${m}m`;
  return `Reset in ${m}m`;
}

function fmtAgo(ts) {
  if (!ts) return '--';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1)  return 'Just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function setBar(barId, pctId, usedPct) {
  const barEl = document.getElementById(barId);
  const pctEl = document.getElementById(pctId);

  if (usedPct == null) {
    barEl.textContent = EMPTY.repeat(BAR_LEN);
    barEl.className = 'bar-chars c-muted';
    pctEl.textContent = '--%';
    pctEl.className = 'bar-pct c-muted';
    return;
  }

  const cls = colorClass(usedPct);
  barEl.textContent = makeBar(usedPct);
  barEl.className = `bar-chars ${cls}`;
  pctEl.textContent = `${Math.round(usedPct)}%`;
  pctEl.className = `bar-pct ${cls}`;
}

function setDetail(id, html) {
  document.getElementById(id).innerHTML = html;
}

// ── Main render ──────────────────────────────────────────────────────────────

function render(usageData, error, lastUpdated) {
  document.getElementById('footer').textContent = fmtAgo(lastUpdated);

  const loginSection = document.getElementById('loginSection');
  const rollingSection = document.getElementById('rollingSection');
  const weeklySection = document.getElementById('weeklySection');
  const zenSection = document.getElementById('zenSection');

  if (error === 'not_logged_in') {
    // Show login prompt, hide data sections
    loginSection.style.display = 'block';
    rollingSection.style.display = 'none';
    weeklySection.style.display = 'none';
    zenSection.style.display = 'none';
    document.getElementById('statusDot').style.background = '#ef4444';
    // Update login message for "not logged in" case
    document.querySelector('.login-msg').textContent = 'Log in to opencode.ai to see your Go & Zen usage data.';
    return;
  }

  if (error === 'workspace_not_found') {
    // Show login/detect prompt, hide data sections
    loginSection.style.display = 'block';
    rollingSection.style.display = 'none';
    weeklySection.style.display = 'none';
    zenSection.style.display = 'none';
    document.getElementById('statusDot').style.background = '#f97316';
    // Update message for "auto-detection failed" case
    document.querySelector('.login-msg').textContent = 'Could not auto-detect your workspace. Open your opencode Go page and click "Detect from current tab", or set the URL manually in Settings.';
    return;
  }

  // Hide login prompt, show data sections
  loginSection.style.display = 'none';
  rollingSection.style.display = 'block';
  weeklySection.style.display = 'block';
  zenSection.style.display = 'block';

  const d = usageData ?? {};

  // ── ROLLING (5H) LIMIT ──
  const rolling = d.rolling;
  if (rolling?.used != null) {
    const used = Number(rolling.used);
    const remaining = Number(rolling.remaining);

    setBar('bar5h', 'pct5h', used);
    const countdown5h = fmtCountdown(rolling.resetAt);
    setDetail('detail5h',
      `Used <span class="hi">${Math.round(used)}%</span>` +
      ` / Rem <span class="hi">${Math.round(remaining)}%</span>` +
      (countdown5h ? ` · <span class="hi">${countdown5h}</span>` : '')
    );

    document.getElementById('statusDot').style.background = dotColor(used);
  } else {
    setBar('bar5h', 'pct5h', null);
    setDetail('detail5h', '<span style="color:#475569">No data — check debug panel</span>');
  }

  // ── WEEKLY (7D) LIMIT ──
  const weekly = d.weekly;
  if (weekly?.used != null) {
    const used = Number(weekly.used);
    const remaining = Number(weekly.remaining);

    setBar('bar7d', 'pct7d', used);
    const countdown = fmtCountdown(weekly.resetAt);
    setDetail('detail7d',
      `Used <span class="hi">${Math.round(used)}%</span>` +
      ` / Rem <span class="hi">${Math.round(remaining)}%</span>` +
      (countdown ? ` · <span class="hi">${countdown}</span>` : '')
    );
  } else {
    setBar('bar7d', 'pct7d', null);
    setDetail('detail7d', '<span style="color:#475569">No data</span>');
  }

  // ── ZEN CREDIT ──
  const zenEl  = document.getElementById('zenValue');
  const zenSub = document.getElementById('zenSub');
  if (d.zen?.balance != null) {
    const bal = Number(d.zen.balance);
    zenEl.textContent = `$${bal.toFixed(2)}`;
    zenEl.className = 'zen-value ' + colorClass(bal > 0 ? 80 : 0);
    zenSub.textContent = 'Balance';
  } else {
    zenEl.textContent = '$ --';
    zenEl.className = 'zen-value c-muted';
    zenSub.textContent = 'No data';
  }

  // ── Debug panel ──
  if (d.source || d.htmlPreview) {
    const raw = d.source === 'solidjs_hydration'
      ? { rolling: d.rolling, weekly: d.weekly, zen: d.zen }
      : (d.htmlPreview ?? d);
    document.getElementById('debugPre').textContent =
      JSON.stringify(raw, null, 2).slice(0, 3000);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

function initSettings() {
  const select = document.getElementById('intervalSelect');
  const urlInput = document.getElementById('workspaceUrl');

  // Load current settings
  chrome.storage.local.get('config', ({ config }) => {
    const minutes = config?.refreshIntervalMinutes ?? 30;
    select.value = String(minutes);
    if (config?.usageUrl) {
      urlInput.value = config.usageUrl;
    }
  });

  select.addEventListener('change', () => {
    const minutes = Number(select.value);
    chrome.runtime.sendMessage({ action: 'setInterval', minutes }, (res) => {
      if (res?.success) {
        select.style.borderColor = '#22c55e';
        setTimeout(() => { select.style.borderColor = ''; }, 800);
      }
    });
  });

  // Save workspace URL when user presses Enter or leaves the field
  urlInput.addEventListener('change', () => {
    const url = urlInput.value.trim();
    if (!url) {
      // Clear manual override, go back to auto-discovery
      chrome.runtime.sendMessage({ action: 'setWorkspaceUrl', url: '' }, (res) => {
        if (res?.success) {
          urlInput.style.borderColor = '#22c55e';
          setTimeout(() => { urlInput.style.borderColor = ''; }, 800);
        }
      });
      return;
    }
    chrome.runtime.sendMessage({ action: 'setWorkspaceUrl', url }, (res) => {
      if (res?.success) {
        urlInput.style.borderColor = '#22c55e';
        setTimeout(() => { urlInput.style.borderColor = ''; }, 800);
      } else {
        urlInput.style.borderColor = '#ef4444';
        setTimeout(() => { urlInput.style.borderColor = ''; }, 800);
      }
    });
  });
}

// ── Events ───────────────────────────────────────────────────────────────────

document.getElementById('refreshBtn').addEventListener('click', () => {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '↻ …';
  btn.disabled = true;

  chrome.runtime.sendMessage({ action: 'refresh' }, (result) => {
    render(result?.usageData, result?.error, result?.lastUpdated);
    btn.textContent = '↻ Refresh';
    btn.disabled = false;
  });
});

document.getElementById('loginBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openLogin' });
});

document.getElementById('detectUrlBtn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0]?.url;
    if (currentUrl && currentUrl.includes('/workspace/')) {
      // Normalize URL to end with /go (handle trailing slash and existing /go)
      let url = currentUrl.replace(/\/?(?:\/go)?$/, '/go');
      chrome.runtime.sendMessage({ action: 'setWorkspaceUrl', url }, (res) => {
        if (res?.success) {
          // Refresh to show data
          chrome.runtime.sendMessage({ action: 'refresh' }, (result) => {
            render(result?.usageData, result?.error, result?.lastUpdated);
          });
        }
      });
    } else {
      alert('Please navigate to your opencode.ai workspace Go page first, then try again.');
    }
  });
});

document.getElementById('settingsToggle').addEventListener('click', () => {
  const panel  = document.getElementById('settingsPanel');
  const toggle = document.getElementById('settingsToggle');
  const open   = panel.classList.toggle('open');
  toggle.textContent = open ? '▾ Settings' : '▸ Settings';
});

document.getElementById('debugToggle').addEventListener('click', () => {
  const panel  = document.getElementById('debugPanel');
  const toggle = document.getElementById('debugToggle');
  const open   = panel.classList.toggle('open');
  toggle.textContent = open ? '▾ debug' : '▸ debug';
});

// ── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.local.get(['usageData', 'error', 'lastUpdated'], (stored) => {
  render(stored.usageData, stored.error, stored.lastUpdated);
});

initSettings();
