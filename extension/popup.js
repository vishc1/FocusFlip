/* FocusFlip · popup.js */

const apiKeyInput = document.getElementById('apiKeyInput');
const saveBtn     = document.getElementById('saveBtn');
const keyStatus   = document.getElementById('keyStatus');
const launchBtn   = document.getElementById('launchBtn');

// Load saved key
chrome.storage.local.get('ff_api_key', ({ ff_api_key }) => {
  if (ff_api_key) {
    apiKeyInput.value = ff_api_key;
    showKeyOk();
  }
});

saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith('sk-')) {
    keyStatus.textContent = '⚠ Key should start with sk-';
    keyStatus.style.color = '#f85149';
    return;
  }
  chrome.storage.local.set({ ff_api_key: key }, showKeyOk);
});

function showKeyOk() {
  const masked = 'sk-...' + apiKeyInput.value.slice(-4);
  keyStatus.textContent = '✓ Saved — ' + masked;
  keyStatus.style.color = '#3fb950';
}

launchBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openMonitor' });
  window.close();
});

// Allow Enter to save key
apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
