/* FocusFlip · background.js — service worker */

let monitorTabId   = null;
let lastUserTabId  = null;   // most recent non-monitor, non-extension tab

// ── Per-tab time tracking ────────────────────────────────────────
let tabTimes          = {};   // hostname → total ms
let activeTabHostname = null;
let activeTabStart    = null;

// ── Restore persisted state on SW restart ────────────────────────
// MV3 service workers are killed after ~30s of inactivity.
// We persist critical IDs and time data to storage.session so they
// survive SW restarts within the same browser session.
(async () => {
  try {
    const data = await chrome.storage.session.get([
      'ff_sw_monitorTabId', 'ff_sw_lastUserTabId', 'ff_sw_tabTimes'
    ]);
    if (data.ff_sw_monitorTabId != null) {
      // Verify the tab still exists before trusting the saved ID
      try {
        await chrome.tabs.get(data.ff_sw_monitorTabId);
        monitorTabId = data.ff_sw_monitorTabId;
      } catch (_) {
        chrome.storage.session.remove('ff_sw_monitorTabId');
      }
    }
    if (data.ff_sw_lastUserTabId != null) {
      try {
        await chrome.tabs.get(data.ff_sw_lastUserTabId);
        lastUserTabId = data.ff_sw_lastUserTabId;
      } catch (_) {
        chrome.storage.session.remove('ff_sw_lastUserTabId');
      }
    }
    if (data.ff_sw_tabTimes) {
      tabTimes = data.ff_sw_tabTimes;
    }
  } catch (_) {}
})();

function isSkippableUrl(url) {
  return !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:');
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch (_) { return null; }
}

function flushActiveTab() {
  if (!activeTabHostname || !activeTabStart) return;
  tabTimes[activeTabHostname] = (tabTimes[activeTabHostname] || 0) + (Date.now() - activeTabStart);
  activeTabStart = Date.now();   // reset start so next flush is incremental
  chrome.storage.session.set({ ff_sw_tabTimes: tabTimes }).catch(() => {});
}

function setActiveTab(url) {
  flushActiveTab();
  activeTabHostname = url ? hostnameOf(url) : null;
  activeTabStart    = activeTabHostname ? Date.now() : null;
}

// Track the last tab the user actually visited
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (tabId === monitorTabId) {
    setActiveTab(null);   // flush previous tab's time, pause tracking while on monitor
    return;
  }
  chrome.tabs.get(tabId, tab => {
    if (chrome.runtime.lastError) return;
    if (isSkippableUrl(tab.url)) return;
    lastUserTabId = tabId;
    chrome.storage.session.set({ ff_sw_lastUserTabId: tabId }).catch(() => {});
    setActiveTab(tab.url);
    notifyMonitorTabChanged();
  });
});

// Detect URL changes within the same tab (e.g. navigating to GeoGuessr in the same tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === monitorTabId) return;
  if (changeInfo.status !== 'complete') return;
  if (isSkippableUrl(tab.url)) return;
  if (tab.active) {
    lastUserTabId = tabId;
    chrome.storage.session.set({ ff_sw_lastUserTabId: tabId }).catch(() => {});
    setActiveTab(tab.url);
    notifyMonitorTabChanged();
  }
});

function notifyMonitorTabChanged() {
  if (monitorTabId === null) return;
  chrome.tabs.sendMessage(monitorTabId, { action: 'tabUrlChanged' }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {

  // Popup asks to open the monitor tab
  if (msg.action === 'openMonitor') {
    openMonitor().then(id => reply({ tabId: id }));
    return true;
  }

  // Monitor asks for per-tab time data
  if (msg.action === 'getTabTimes') {
    flushActiveTab();
    reply({ tabTimes: { ...tabTimes } });
    return true;
  }

  // Monitor asks for the tab it should analyze
  // Returns the last tab the user visited (not the monitor, not extension pages)
  if (msg.action === 'getActiveTab') {
    // First try the tracked last user tab
    if (lastUserTabId !== null) {
      chrome.tabs.get(lastUserTabId, tab => {
        if (!chrome.runtime.lastError && tab && tab.url &&
            !tab.url.startsWith('chrome://') &&
            !tab.url.startsWith('chrome-extension://') &&
            !tab.url.startsWith('about:')) {
          reply({ tab });
          return;
        }
        // Fallback: any active non-monitor tab across all windows
        chrome.tabs.query({ active: true }, tabs => {
          const found = tabs.find(t =>
            t.id !== monitorTabId && t.url &&
            !t.url.startsWith('chrome://') &&
            !t.url.startsWith('chrome-extension://') &&
            !t.url.startsWith('about:')
          );
          reply({ tab: found || null });
        });
      });
    } else {
      chrome.tabs.query({ active: true }, tabs => {
        const found = tabs.find(t =>
          t.id !== monitorTabId && t.url &&
          !t.url.startsWith('chrome://') &&
          !t.url.startsWith('chrome-extension://') &&
          !t.url.startsWith('about:')
        );
        reply({ tab: found || null });
      });
    }
    return true;
  }

  // Monitor instructs a redirect + overlay
  if (msg.action === 'focusflip:pause') {
    chrome.storage.local.set({ ff_pause_until: Date.now() + (msg.duration || 120_000) });
    reply({ ok: true });
  }

  if (msg.action === 'flipTab') {
    const { tabId, redirectUrl, score, category, reason,
            redirectName, redirectIcon, lastProductive, distractionCount, sessionIntent } = msg;

    // Try to show overlay first; content script might not be injected yet
    chrome.tabs.sendMessage(tabId, {
      action: 'focusflip:overlay',
      score, category, reason, redirectName, redirectIcon,
      redirectUrl, lastProductive, distractionCount, sessionIntent,
    }).catch(() => {
      // Content script not ready — redirect directly
      chrome.tabs.update(tabId, { url: redirectUrl });
    });

    reply({ ok: true });
  }
});

async function openMonitor() {
  // Reuse existing monitor tab if it's still alive
  if (monitorTabId !== null) {
    try {
      const tab = await chrome.tabs.get(monitorTabId);
      await chrome.tabs.update(monitorTabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return monitorTabId;
    } catch (_) { monitorTabId = null; }
  }

  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL('monitor.html'),
    active: true,
  });
  monitorTabId = tab.id;
  chrome.storage.session.set({ ff_sw_monitorTabId: monitorTabId }).catch(() => {});

  // Clear stored ID when tab closes
  chrome.tabs.onRemoved.addListener(function onRemoved(id) {
    if (id === monitorTabId) {
      monitorTabId = null;
      chrome.storage.session.remove('ff_sw_monitorTabId').catch(() => {});
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }
  });

  return monitorTabId;
}
