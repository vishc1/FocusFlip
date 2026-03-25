/* ═══════════════════════════════════════════════════════════════
   FocusFlip · app.js
   Presence detection + page scoring + smart redirect
   ═══════════════════════════════════════════════════════════════ */

// ── Page scoring rules ────────────────────────────────────────
const PAGE_RULES = [
  // ▼ DISTRACTING (10–35)
  { patterns: ['youtube.com/shorts', 'youtu.be/shorts'],      score: [10, 22], category: 'Entertainment Shorts',  type: 'entertainment' },
  { patterns: ['tiktok.com'],                                  score: [10, 20], category: 'Short-form Video',      type: 'entertainment' },
  { patterns: ['instagram.com'],                               score: [14, 26], category: 'Social Media',          type: 'social'        },
  { patterns: ['twitter.com', 'x.com'],                       score: [18, 32], category: 'Social Media',          type: 'social'        },
  { patterns: ['reddit.com'],                                  score: [25, 40], category: 'Social Forum',          type: 'social'        },
  { patterns: ['discord.com', 'discord.gg'],                  score: [20, 35], category: 'Social Messaging',      type: 'social'        },
  { patterns: ['netflix.com', 'hulu.com', 'max.com', 'disneyplus.com', 'primevideo.com'], score: [8, 18],  category: 'Video Streaming',    type: 'entertainment' },
  { patterns: ['twitch.tv'],                                   score: [12, 24], category: 'Live Streaming',        type: 'entertainment' },
  { patterns: ['roblox.com', 'coolmathgames.com', 'poki.com', 'friv.com', 'miniclip.com', 'gameflare.com'], score: [6, 15], category: 'Online Gaming', type: 'gaming' },
  { patterns: ['amazon.com/s', 'amazon.com/dp', 'ebay.com', 'etsy.com', 'shein.com'], score: [12, 26], category: 'Online Shopping', type: 'shopping' },
  { patterns: ['buzzfeed.com', 'tmz.com', '9gag.com'],        score: [8, 18],  category: 'Entertainment News',    type: 'entertainment' },

  // ▼ EDUCATIONAL (75–96)
  { patterns: ['khanacademy.org'],                             score: [88, 96], category: 'Interactive Learning',  type: 'educational' },
  { patterns: ['wikipedia.org/wiki'],                          score: [78, 90], category: 'Encyclopedia',          type: 'educational' },
  { patterns: ['docs.google.com'],                             score: [80, 91], category: 'Document Collaboration',type: 'educational' },
  { patterns: ['classroom.google.com'],                        score: [88, 96], category: 'Learning Management',   type: 'educational' },
  { patterns: ['quizlet.com'],                                 score: [84, 94], category: 'Study Tools',           type: 'educational' },
  { patterns: ['coursera.org', 'edx.org'],                     score: [86, 95], category: 'Online Courses',        type: 'educational' },
  { patterns: ['canvas.', 'schoology.com', 'blackboard.com', 'moodle', 'powerschool'], score: [87, 96], category: 'LMS / Gradebook', type: 'educational' },
  { patterns: ['duolingo.com'],                                score: [82, 92], category: 'Language Learning',     type: 'educational' },
  { patterns: ['wolframalpha.com'],                            score: [80, 89], category: 'Computation Engine',    type: 'educational' },
  { patterns: ['github.com'],                                  score: [72, 85], category: 'Code Repository',       type: 'educational' },
  { patterns: ['stackoverflow.com'],                           score: [74, 85], category: 'Programming Help',      type: 'educational' },
  { patterns: ['scholar.google', 'pubmed', 'jstor.org', 'arxiv.org'], score: [88, 96], category: 'Academic Research', type: 'educational' },
  { patterns: ['chegg.com', 'slader.com', 'brainly.com'],     score: [72, 84], category: 'Homework Help',         type: 'educational' },
  { patterns: ['desmos.com', 'geogebra.org'],                  score: [82, 91], category: 'Math Tools',            type: 'educational' },
];

// Smart redirect: bad type → best replacement
const REDIRECTS = {
  entertainment: { url: 'https://www.khanacademy.org',        name: 'Khan Academy',    icon: '📚', reason: 'entertainment site detected'   },
  social:        { url: 'https://quizlet.com',                 name: 'Quizlet',         icon: '📝', reason: 'social media detected'          },
  gaming:        { url: 'https://code.org',                    name: 'Code.org',        icon: '💻', reason: 'gaming site detected'           },
  shopping:      { url: 'https://docs.google.com',             name: 'Google Docs',     icon: '📄', reason: 'shopping detected'              },
  neutral:       { url: 'https://www.khanacademy.org',         name: 'Khan Academy',    icon: '📚', reason: 'low educational value'          },
};

// ── State ──────────────────────────────────────────────────────
let tfModel        = null;
let stream         = null;
let detectionLoop  = null;
let isMonitoring   = true;
let personPresent  = false;
let countdownTimer = null;
let detectionCount = 0;
let currentResult  = null;  // { score, category, type, redirect }

// ── DOM refs ───────────────────────────────────────────────────
const video            = document.getElementById('video');
const canvas           = document.getElementById('canvas');
const ctx              = canvas.getContext('2d');
const cameraInit       = document.getElementById('cameraInit');
const cameraInitText   = document.getElementById('cameraInitText');
const personBadge      = document.getElementById('personBadge');
const scanLine         = document.getElementById('scanLine');
const navDot           = document.getElementById('navDot');
const navStatusText    = document.getElementById('navStatusText');
const confidenceRow    = document.getElementById('confidenceRow');
const confidenceFill   = document.getElementById('confidenceFill');
const confidencePct    = document.getElementById('confidencePct');
const detectionCounter = document.getElementById('detectionCounter');
const urlInput         = document.getElementById('urlInput');
const urlPageTitle     = document.getElementById('urlPageTitle');
const analyzeBtn       = document.getElementById('analyzeBtn');
const scoreNumber      = document.getElementById('scoreNumber');
const scoreCategory    = document.getElementById('scoreCategory');
const scoreBarFill     = document.getElementById('scoreBarFill');
const scoreTypePill    = document.getElementById('scoreTypePill');
const scoreVerdict     = document.getElementById('scoreVerdict');
const redirectCard     = document.getElementById('redirectCard');
const redirectIcon     = document.getElementById('redirectIcon');
const redirectReason   = document.getElementById('redirectReason');
const redirectDest     = document.getElementById('redirectDest');
const triggerBtn       = document.getElementById('triggerBtn');
const simBtn           = document.getElementById('simBtn');
const autoFlipToggle   = document.getElementById('autoFlipToggle');
const overlay          = document.getElementById('overlay');
const overlayScore     = document.getElementById('overlayScore');
const overlayScoreBar  = document.getElementById('overlayScoreBar');
const overlayCategory  = document.getElementById('overlayCategory');
const overlayActionIcon= document.getElementById('overlayActionIcon');
const overlayActionName= document.getElementById('overlayActionName');
const countdownNum     = document.getElementById('countdownNum');
const cancelBtn        = document.getElementById('cancelBtn');
const goNowBtn         = document.getElementById('goNowBtn');
const logEntries       = document.getElementById('logEntries');
const toast            = document.getElementById('toast');
const toastMsg         = document.getElementById('toastMsg');
const toastIcon        = document.getElementById('toastIcon');

// ── Utility ────────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const time = () => new Date().toLocaleTimeString('en-US', { hour12: false });

function addLog(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-time">${time()}</span><span class="log-msg ${type}">${msg}</span>`;
  logEntries.prepend(el);
  while (logEntries.children.length > 30) logEntries.removeChild(logEntries.lastChild);
}

function setStatus(text, dotClass) {
  navStatusText.textContent = text;
  navDot.className = 'status-dot ' + dotClass;
}

let toastTimeout = null;
function showToast(msg, icon = '✓') {
  toastMsg.textContent = msg;
  toastIcon.textContent = icon;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Scoring engine ─────────────────────────────────────────────
function scorePage(url, title = '') {
  const combined = (url + ' ' + title).toLowerCase();

  for (const rule of PAGE_RULES) {
    for (const pattern of rule.patterns) {
      if (combined.includes(pattern)) {
        const score = rand(...rule.score);
        return { score, category: rule.category, type: rule.type };
      }
    }
  }

  // Heuristics for neutral/unknown pages
  const neutralKeywords = ['news', 'blog', 'medium.com', 'substack', 'youtube.com/watch'];
  for (const kw of neutralKeywords) {
    if (combined.includes(kw)) return { score: rand(38, 58), category: 'General Content', type: 'neutral' };
  }

  return { score: rand(44, 64), category: 'General Web', type: 'neutral' };
}

// ── Animated score counter ─────────────────────────────────────
function animateScore(targetScore, colorClass) {
  const colorMap = { low: '#f85149', mid: '#d29922', high: '#3fb950' };
  const color = colorMap[colorClass];

  let current = 0;
  const duration = 700;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    current = Math.round(eased * targetScore);
    scoreNumber.textContent = current;
    scoreNumber.style.color = color;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  scoreBarFill.style.width  = targetScore + '%';
  scoreBarFill.style.background = color;
}

// ── Display analysis result ────────────────────────────────────
function displayResult(result) {
  const { score, category, type } = result;
  const tier = score < 40 ? 'low' : score < 70 ? 'mid' : 'high';

  scoreCategory.textContent = category;
  animateScore(score, tier);

  const pillColors = {
    educational:  { bg: 'rgba(63,185,80,0.12)',  color: '#3fb950', border: 'rgba(63,185,80,0.25)'  },
    social:       { bg: 'rgba(248,81,73,0.12)',  color: '#f85149', border: 'rgba(248,81,73,0.25)'  },
    entertainment:{ bg: 'rgba(248,81,73,0.12)',  color: '#f85149', border: 'rgba(248,81,73,0.25)'  },
    gaming:       { bg: 'rgba(248,81,73,0.12)',  color: '#f85149', border: 'rgba(248,81,73,0.25)'  },
    shopping:     { bg: 'rgba(210,153,34,0.12)', color: '#d29922', border: 'rgba(210,153,34,0.25)' },
    neutral:      { bg: 'rgba(139,148,158,0.1)', color: '#8b949e', border: 'rgba(139,148,158,0.2)' },
  };
  const pc = pillColors[type] || pillColors.neutral;
  scoreTypePill.textContent = type.charAt(0).toUpperCase() + type.slice(1);
  scoreTypePill.style.cssText = `background:${pc.bg}; color:${pc.color}; border:1px solid ${pc.border}`;

  const verdicts = {
    low:  `⚠️ Low educational value — FocusFlip recommends switching this page`,
    mid:  `~ Neutral content — acceptable, but you could be more productive`,
    high: `✓ High educational value — great! No action needed`,
  };
  scoreVerdict.textContent = verdicts[tier];
  scoreVerdict.style.color  = tier === 'low' ? '#f85149' : tier === 'mid' ? '#d29922' : '#3fb950';

  // Show redirect card for low-scoring pages
  if (score < 40 && type !== 'educational') {
    const redirect = REDIRECTS[type] || REDIRECTS.neutral;
    result.redirect = redirect;
    redirectIcon.textContent = redirect.icon;
    redirectReason.textContent = redirect.reason;
    redirectDest.textContent  = '→ ' + redirect.name;
    redirectCard.style.display = 'flex';
  } else {
    redirectCard.style.display = 'none';
  }

  currentResult = result;
}

// ── Analyze current URL ────────────────────────────────────────
function analyzeURL() {
  const url   = urlInput.value.trim();
  const title = urlPageTitle.textContent;
  if (!url) return;

  const result = scorePage(url, title);
  displayResult(result);
  addLog(
    `Scored "${url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}" → ${result.score}/100 (${result.category})`,
    result.score < 40 ? 'bad' : result.score < 70 ? 'warn' : 'good'
  );
}

// ── Overlay logic ──────────────────────────────────────────────
function showOverlay() {
  if (!currentResult) {
    analyzeURL();
    if (!currentResult) return;
  }

  const { score, category, redirect } = currentResult;
  if (!redirect) {
    showToast(`Page scores ${score}/100 — no redirect needed ✓`, '✓');
    addLog(`Overlay skipped — page is educational (${score}/100)`, 'good');
    return;
  }

  // Set overlay content
  overlayScore.textContent = score;
  overlayScoreBar.style.width = score + '%';
  overlayScoreBar.style.background = '#f85149';
  overlayCategory.textContent = category;
  overlayActionIcon.textContent = redirect.icon;
  overlayActionName.textContent = redirect.name;

  overlay.classList.add('visible');
  addLog(`🚨 Overlay triggered — redirecting to ${redirect.name}`, 'bad');

  // Countdown
  let secs = 5;
  countdownNum.textContent = secs;

  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    secs--;
    countdownNum.textContent = secs;
    if (secs <= 0) {
      clearInterval(countdownTimer);
      performRedirect();
    }
  }, 1000);
}

function hideOverlay() {
  overlay.classList.remove('visible');
  clearInterval(countdownTimer);
  addLog('Overlay dismissed by user', '');
}

function performRedirect() {
  hideOverlay();
  const redirect = currentResult?.redirect;
  if (!redirect) return;
  addLog(`Redirecting to ${redirect.name} → ${redirect.url}`, 'good');
  showToast(`Redirecting to ${redirect.name}...`, redirect.icon);
  setTimeout(() => window.open(redirect.url, '_blank'), 400);
}

// ── Camera setup ───────────────────────────────────────────────
async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = stream;
    await video.play();

    video.addEventListener('loadedmetadata', () => {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    });

    cameraInit.classList.add('hidden');
    addLog('Camera initialized', 'good');
    return true;
  } catch (err) {
    cameraInitText.textContent = '📷 Camera unavailable — use Simulate button';
    cameraInit.style.background = 'rgba(248,81,73,0.06)';
    addLog('Camera access denied — use Simulate button', 'warn');
    setStatus('Camera unavailable', 'warning');
    return false;
  }
}

// ── TF.js model ────────────────────────────────────────────────
async function initModel() {
  try {
    setStatus('Loading AI model...', '');
    addLog('Loading COCO-SSD model...', '');
    tfModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    addLog('COCO-SSD loaded ✓', 'good');
    setStatus('Monitoring active', 'active');
    scanLine.classList.add('active');
    startDetectionLoop();
  } catch (err) {
    addLog('Model failed to load — use Simulate button', 'warn');
    setStatus('AI model unavailable', 'warning');
  }
}

// ── Detection loop ─────────────────────────────────────────────
function startDetectionLoop() {
  clearInterval(detectionLoop);
  detectionLoop = setInterval(runDetection, 1200);
}

async function runDetection() {
  if (!tfModel || !isMonitoring) return;
  if (!video || video.readyState < 2 || video.paused) return;

  try {
    const predictions = await tfModel.detect(video);
    const persons = predictions.filter(p => p.class === 'person' && p.score > 0.5);

    drawBoxes(predictions);

    if (persons.length > 0) {
      const best = persons.reduce((a, b) => a.score > b.score ? a : b);
      onPersonDetected(best.score);
    } else {
      onPersonLeft();
    }
  } catch (_) { /* silent */ }
}

function drawBoxes(predictions) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  predictions.forEach(pred => {
    if (pred.score < 0.45) return;
    const [x, y, w, h] = pred.bbox;
    const isP = pred.class === 'person';
    ctx.strokeStyle = isP ? '#3fb950' : '#388bfd';
    ctx.lineWidth   = 2;
    ctx.strokeRect(x, y, w, h);

    // Label
    const label = `${pred.class} ${Math.round(pred.score * 100)}%`;
    ctx.fillStyle = isP ? 'rgba(63,185,80,0.85)' : 'rgba(56,139,253,0.85)';
    ctx.fillRect(x, y - 22, ctx.measureText(label).width + 12, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(label, x + 6, y - 6);
  });
}

function onPersonDetected(confidence) {
  if (!personPresent) {
    personPresent = true;
    detectionCount++;
    detectionCounter.textContent = `${detectionCount} detection${detectionCount !== 1 ? 's' : ''}`;
    addLog(`👤 Person detected (${Math.round(confidence * 100)}% confidence)`, 'warn');
    setStatus('Person detected!', 'alert');

    if (autoFlipToggle.checked) {
      analyzeURL();
      if (currentResult && currentResult.score < 40) {
        setTimeout(showOverlay, 600);
      }
    }
  }

  personBadge.classList.add('visible');
  confidenceRow.style.display = 'flex';
  confidenceFill.style.width  = Math.round(confidence * 100) + '%';
  confidencePct.textContent   = Math.round(confidence * 100) + '%';
}

function onPersonLeft() {
  if (personPresent) {
    personPresent = false;
    addLog('No person detected', '');
    setStatus('Monitoring — no one detected', 'active');
  }
  personBadge.classList.remove('visible');
}

// ── Quick picks ────────────────────────────────────────────────
document.querySelectorAll('.qp').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.qp').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    urlInput.value          = btn.dataset.url;
    urlPageTitle.textContent = btn.dataset.title;
    analyzeURL();
  });
});

// ── Event listeners ────────────────────────────────────────────
analyzeBtn.addEventListener('click', () => {
  analyzeURL();
  addLog(`Manual analysis triggered`, '');
});

urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { analyzeURL(); addLog('Manual analysis triggered', ''); }
});

urlInput.addEventListener('input', () => {
  // Guess title from URL for display
  try {
    const host = new URL(urlInput.value).hostname.replace('www.', '');
    urlPageTitle.textContent = host;
  } catch (_) { urlPageTitle.textContent = ''; }
});

simBtn.addEventListener('click', () => {
  addLog('Simulating person detection...', 'warn');
  onPersonDetected(0.87 + Math.random() * 0.1);
  setTimeout(onPersonLeft, 8000);
});

triggerBtn.addEventListener('click', showOverlay);

cancelBtn.addEventListener('click', hideOverlay);

goNowBtn.addEventListener('click', performRedirect);

// Dismiss overlay on backdrop click
overlay.addEventListener('click', e => {
  if (e.target === overlay) hideOverlay();
});

// Keyboard: Escape closes overlay
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideOverlay();
});

// ── Boot ───────────────────────────────────────────────────────
async function boot() {
  addLog('FocusFlip starting...', '');
  setStatus('Initializing...', '');

  // Run analysis on the default URL
  analyzeURL();

  const cameraOk = await initCamera();
  if (cameraOk) await initModel();
  else setStatus('Use Simulate button', 'warning');

  addLog('Ready — monitoring active', 'good');
}

boot();
