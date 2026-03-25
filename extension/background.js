/* FocusFlip · background.js — service worker */

let monitorTabId = null;

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {

  // Popup asks to open the monitor tab
  if (msg.action === 'openMonitor') {
    openMonitor().then(id => reply({ tabId: id }));
    return true;
  }

  // Monitor asks for the tab it should analyze
  // Returns the most recently active NON-extension tab
  if (msg.action === 'getActiveTab') {
    chrome.tabs.query({ active: true }, tabs => {
      const tab = tabs.find(t =>
        t.id !== monitorTabId &&
        t.url &&
        !t.url.startsWith('chrome://') &&
        !t.url.startsWith('chrome-extension://') &&
        !t.url.startsWith('about:')
      );
      reply({ tab: tab || null });
    });
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

  // Clear stored ID when tab closes
  chrome.tabs.onRemoved.addListener(function onRemoved(id) {
    if (id === monitorTabId) { monitorTabId = null; chrome.tabs.onRemoved.removeListener(onRemoved); }
  });

  return monitorTabId;
}
