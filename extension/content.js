/* FocusFlip · content.js — injected into every page */

if (!window.__focusflipLoaded) {
  window.__focusflipLoaded = true;

  let overlayEl = null;

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.action === 'focusflip:overlay') showOverlay(msg);
    if (msg.action === 'focusflip:hide')    hideOverlay();
    reply && reply({ ok: true });
  });

  // Nudge tone adapts based on how many times the student has been distracted
  function nudgeTone(count) {
    if (count === 0) return { headline: 'Looks like you drifted 🙂', sub: 'Here\'s a gentle nudge back to learning.' };
    if (count === 1) return { headline: 'Second distraction this session', sub: 'You\'ve got this — let\'s refocus.' };
    if (count === 2) return { headline: 'Third distraction detected', sub: 'Consider switching — your focus will thank you.' };
    return { headline: `${count + 1} distractions this session 💪`, sub: 'Recovery time. Let\'s get back on track together.' };
  }

  function showOverlay({
    score, category, reason, redirectName, redirectIcon, redirectUrl,
    lastProductive = null, distractionCount = 0, sessionIntent = null,
  }) {
    hideOverlay();

    const tier  = score < 40 ? 'low' : score < 65 ? 'mid' : 'high';
    const color = { low: '#f85149', mid: '#d29922', high: '#3fb950' }[tier];
    const tone  = nudgeTone(distractionCount);

    const safeReason = (reason || 'Low educational value detected.')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const safeIntent = sessionIntent
      ? sessionIntent.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      : null;

    const intentBanner = safeIntent
      ? `<div class="ff-intent-banner">
           <span class="ff-intent-label">🎯 Your goal this session:</span>
           <span class="ff-intent-value">${safeIntent}</span>
         </div>`
      : '';

    // Shorten lastProductive title for display
    const prevTitle = lastProductive?.title
      ? lastProductive.title.slice(0, 38) + (lastProductive.title.length > 38 ? '…' : '')
      : null;

    const returnBtn = prevTitle
      ? `<button id="ff-return" class="ff-btn-return">↩ Resume previous task — "${prevTitle}"</button>`
      : '';

    overlayEl = document.createElement('div');
    overlayEl.id = 'ff-root';
    overlayEl.innerHTML = `
      <div class="ff-card">

        <div class="ff-header">
          <div class="ff-brand">⚡ FocusFlip</div>
          <div class="ff-nudge-badge">Gentle Focus Nudge</div>
        </div>

        <div class="ff-tone-row">
          <div class="ff-tone-headline">${tone.headline}</div>
          <div class="ff-tone-sub">${tone.sub}</div>
        </div>

        ${intentBanner}

        <div class="ff-score-section">
          <div class="ff-score-header-row">
            <span class="ff-score-lbl">Educational Score</span>
            <span class="ff-score-model">gpt-4o-mini</span>
          </div>
          <div class="ff-score-number-row">
            <span class="ff-score-val" style="color:${color}">${score}</span>
            <span class="ff-score-denom">/100</span>
            <span class="ff-cat-chip" style="background:${color}22;color:${color};border-color:${color}44">${category}</span>
          </div>
          <div class="ff-bar-bg">
            <div class="ff-bar-fill" style="width:${score}%;background:${color}"></div>
          </div>
        </div>

        <div class="ff-reason-box">
          <div class="ff-reason-label">💬 AI Reasoning</div>
          <div class="ff-reason-text">"${safeReason}"</div>
        </div>

        <div class="ff-redirect-section">
          <div class="ff-redirect-label">
            ${lastProductive ? '🧠 Context-aware recommendation' : 'Recommended alternative'}
          </div>
          <div class="ff-redirect-dest">
            <span class="ff-redirect-icon">${redirectIcon || '📚'}</span>
            <div>
              <div class="ff-redirect-name">${redirectName || 'Productive Page'}</div>
              ${lastProductive ? `<div class="ff-redirect-context">matched to your prior work on "${prevTitle}"</div>` : ''}
            </div>
          </div>
        </div>

        <div class="ff-btns">
          ${returnBtn}
          <div class="ff-btns-row2">
            <button id="ff-stay" class="ff-btn-stay">⏱ Stay — 2 min</button>
            <button id="ff-go"   class="ff-btn-go">Switch Now →</button>
          </div>
        </div>

        <div class="ff-footer-note">
          We are not blocking — we are building adaptive nudges for learning.
        </div>

      </div>
    `;

    document.documentElement.appendChild(overlayEl);

    // Return to last productive tab
    const returnEl = overlayEl.querySelector('#ff-return');
    if (returnEl && lastProductive?.url) {
      returnEl.addEventListener('click', () => {
        window.location.href = lastProductive.url;
      });
    }

    // Stay for 2 minutes
    overlayEl.querySelector('#ff-stay').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'focusflip:pause', duration: 120_000 });
      hideOverlay();
    });

    // Go to AI-suggested redirect
    overlayEl.querySelector('#ff-go').addEventListener('click', () => {
      window.location.href = redirectUrl;
    });

    // Backdrop or Escape dismisses without redirect
    overlayEl.addEventListener('click', e => { if (e.target === overlayEl) hideOverlay(); });
    document.addEventListener('keydown', onEscape);
  }

  function onEscape(e) {
    if (e.key === 'Escape') { hideOverlay(); document.removeEventListener('keydown', onEscape); }
  }

  function hideOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    document.removeEventListener('keydown', onEscape);
  }
}
