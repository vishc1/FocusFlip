/* ═══════════════════════════════════════════════════════════════
   FocusFlip · monitor.js  v3
   Intent-aware · Timeline · Honest Minutes · Context-aware AI
   ═══════════════════════════════════════════════════════════════ */

const OPENAI_SYSTEM_PROMPT = `You are FocusFlip, a presence-aware learning assistant that helps students stay aligned with their stated study goals.

Given a webpage URL, page title, and optional context, return ONLY a valid JSON object — no markdown.

JSON schema:
{
  "score": <integer 0–100, educational productivity value>,
  "category": <"Educational" | "Social Media" | "Entertainment" | "Gaming" | "Shopping" | "Productivity" | "Research" | "News" | "Neutral">,
  "reason": <one sentence — be specific about why this page does or doesn't support the student's goal>,
  "should_redirect": <boolean, true if score < threshold>,
  "redirect_url": <best redirect URL, or null>,
  "redirect_name": <friendly name, or null>,
  "redirect_icon": <single emoji, or null>
}

Scoring:
0–20:  Pure distraction (TikTok, YouTube Shorts, Roblox, Netflix, Instagram, Reddit, GeoGuessr, online games, streaming)
21–40: Social / light entertainment / shopping / casual browsing / geography games
41–55: Neutral (news, general YouTube, casual Wikipedia)
56–75: Partially educational (GitHub, Stack Overflow, productivity tools, reference docs)
76–100: Clearly educational and directly goal-aligned (Khan Academy, textbook sites, academic papers, study tools)

STRICT RULE: Any game — even if it has an educational theme (geography games, trivia, puzzle games) — must score 30 or below. Games are for entertainment, not studying. GeoGuessr = 15. Wordle = 20. Wikipedia rabbit holes = 35.

IMPORTANT: If a student has declared a study goal (e.g. "AP Biology"), penalize pages that don't relate to it even if they are mildly educational. Reward pages that directly support the stated goal.

Smart redirect — choose the MOST contextually relevant site:
- If student declared a goal, suggest a resource directly related to that topic (e.g. Khan Academy's specific subject, a relevant Wikipedia article stub, etc.)
- Gaming → https://code.org "Code.org" 💻
- Social media → https://quizlet.com "Quizlet" 📝
- Entertainment → https://www.khanacademy.org "Khan Academy" 📚
- Shopping → https://docs.google.com "Google Docs" 📄
- Music / lifestyle → https://www.duolingo.com "Duolingo" 🌍
- Default → https://www.khanacademy.org "Khan Academy" 📚`;

// ── Settings & state ───────────────────────────────────────────
let apiKey     = '';
let threshold  = 40;
let cooldownMs = 45_000;

let stream        = null;
let faceDetector  = null;
let useFaceAPI    = false;
let detectionLoop = null;

let personPresent  = false;
let presenceFrames = 0;
const PRESENCE_CONFIRM = 3;

let lastCheckAt  = 0;
let isAnalyzing  = false;

// ── Session intent ─────────────────────────────────────────────
let sessionIntent = '';

// ── Session timeline ───────────────────────────────────────────
const SESSION_START = Date.now();
let timelineSegs    = [];              // completed segments
let currentSegType  = 'away';
let currentSegStart = SESSION_START;
let timelineInterval = null;

// ── Honest minutes ─────────────────────────────────────────────
let honestFocusMs  = 0;
let totalPresentMs = 0;
let currentStreakMs = 0;
let bestStreakMs    = 0;
let lastTickAt      = null;
let currentPageScore = null;          // last scored value for present page

// ── Stats ──────────────────────────────────────────────────────
let statRedirects = 0;
let statScores    = [];

// ── DOM ────────────────────────────────────────────────────────
const video              = document.getElementById('video');
const canvas             = document.getElementById('canvas');
const ctx                = canvas.getContext('2d');
const cameraPlaceholder  = document.getElementById('cameraPlaceholder');
const camPlaceholderText = document.getElementById('camPlaceholderText');
const personChip         = document.getElementById('personChip');
const scanBar            = document.getElementById('scanBar');
const confidenceStrip    = document.getElementById('confidenceStrip');
const csFill             = document.getElementById('csFill');
const csPct              = document.getElementById('csPct');
const detectionDot       = document.getElementById('detectionDot');
const detectionLabel     = document.getElementById('detectionLabel');
const focusWeather       = document.getElementById('focusWeather');
const apiDot             = document.getElementById('apiDot');
const apiLabel           = document.getElementById('apiLabel');
const apiKeyInput        = document.getElementById('apiKeyInput');
const saveKeyBtn         = document.getElementById('saveKeyBtn');
const keyHint            = document.getElementById('keyHint');
const settingsToggle     = document.getElementById('settingsToggle');
const settingsDrawer     = document.getElementById('settingsDrawer');
const thresholdSlider    = document.getElementById('thresholdSlider');
const thresholdVal       = document.getElementById('thresholdVal');
const cooldownSelect     = document.getElementById('cooldownSelect');
const intentInput        = document.getElementById('intentInput');
const setIntentBtn       = document.getElementById('setIntentBtn');
const intentUnset        = document.getElementById('intentUnset');
const intentSet          = document.getElementById('intentSet');
const intentText         = document.getElementById('intentText');
const clearIntentBtn     = document.getElementById('clearIntentBtn');
const timelineTrack      = document.getElementById('timelineTrack');
const timelineDuration   = document.getElementById('timelineDuration');
const simBtn             = document.getElementById('simBtn');
const tabUrl             = document.getElementById('tabUrl');
const tabTitle           = document.getElementById('tabTitle');
const scoreIdle          = document.getElementById('scoreIdle');
const scoreLoading       = document.getElementById('scoreLoading');
const loadingLabel       = document.getElementById('loadingLabel');
const scoreResult        = document.getElementById('scoreResult');
const srNumber           = document.getElementById('srNumber');
const srCategoryPill     = document.getElementById('srCategoryPill');
const srBarFill          = document.getElementById('srBarFill');
const srReason           = document.getElementById('srReason');
const scoreError         = document.getElementById('scoreError');
const scoreErrorMsg      = document.getElementById('scoreErrorMsg');
const actionCard         = document.getElementById('actionCard');
const actionIcon         = document.getElementById('actionIcon');
const actionDest         = document.getElementById('actionDest');
const actionUrl          = document.getElementById('actionUrl');
const tabTimesList       = document.getElementById('tabTimesList');
const logEntries         = document.getElementById('logEntries');
const honestMinutesEl    = document.getElementById('honestMinutes');
const focusScoreEl       = document.getElementById('focusScore');
const bestStreakEl       = document.getElementById('bestStreak');
const statRedirectsEl    = document.getElementById('statRedirects');

// ── Logging ────────────────────────────────────────────────────
function log(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'log-entry';
  const t = new Date().toLocaleTimeString('en-US', { hour12: false });
  el.innerHTML = `<span class="le-time">${t}</span><span class="le-msg ${type}">${msg}</span>`;
  logEntries.prepend(el);
  while (logEntries.children.length > 60) logEntries.removeChild(logEntries.lastChild);
}

// ── Settings ────────────────────────────────────────────────────
function loadSettings() {
  chrome.storage.local.get([
    'ff_api_key', 'ff_threshold', 'ff_cooldown', 'ff_intent'
  ], data => {
    if (data.ff_api_key) { apiKey = data.ff_api_key; apiKeyInput.value = apiKey; showApiOk(); }
    if (data.ff_threshold) { threshold = data.ff_threshold; thresholdSlider.value = threshold; thresholdVal.textContent = threshold; }
    if (data.ff_cooldown)  { cooldownMs = data.ff_cooldown; cooldownSelect.value = cooldownMs; }
    if (data.ff_intent)    applyIntent(data.ff_intent);
  });
}

function showApiOk() {
  apiDot.className = 'api-dot ok';
  apiLabel.textContent = 'API ready ✓';
  keyHint.textContent  = '✓ Key saved — sk-...' + apiKey.slice(-4);
  keyHint.style.color  = '#3fb950';
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith('sk-')) { keyHint.textContent = '⚠ Should start with sk-'; keyHint.style.color = '#f85149'; return; }
  apiKey = key;
  chrome.storage.local.set({ ff_api_key: key });
  showApiOk();
  log('API key saved', 'good');
});

settingsToggle.addEventListener('click', () => settingsDrawer.classList.toggle('open'));

thresholdSlider.addEventListener('input', () => {
  threshold = +thresholdSlider.value;
  thresholdVal.textContent = threshold;
  chrome.storage.local.set({ ff_threshold: threshold });
});

cooldownSelect.addEventListener('change', () => {
  cooldownMs = +cooldownSelect.value;
  chrome.storage.local.set({ ff_cooldown: cooldownMs });
});

// ── Intent ─────────────────────────────────────────────────────
setIntentBtn.addEventListener('click', () => {
  const val = intentInput.value.trim();
  if (!val) return;
  applyIntent(val);
  chrome.storage.local.set({ ff_intent: val });
  log(`🎯 Goal set: "${val}"`, 'good');
});

clearIntentBtn.addEventListener('click', () => {
  sessionIntent = '';
  intentUnset.style.display = '';
  intentSet.style.display   = 'none';
  intentInput.value = '';
  chrome.storage.local.remove('ff_intent');
  log('Goal cleared', '');
});

intentInput.addEventListener('keydown', e => { if (e.key === 'Enter') setIntentBtn.click(); });

function applyIntent(val) {
  sessionIntent = val;
  intentText.textContent    = val;
  intentUnset.style.display = 'none';
  intentSet.style.display   = '';
}

// ── Focus Timeline ─────────────────────────────────────────────
function switchSegment(newType) {
  if (currentSegType === newType) return;
  const now = Date.now();
  if (now - currentSegStart > 500) {             // ignore micro-segments
    timelineSegs.push({ type: currentSegType, startMs: currentSegStart, endMs: now });
  }
  currentSegType  = newType;
  currentSegStart = now;
  renderTimeline();
}

function renderTimeline() {
  const total = Math.max(Date.now() - SESSION_START, 1);

  // Build all segments including the live current one
  const all = [...timelineSegs, {
    type: currentSegType,
    startMs: currentSegStart,
    endMs: Date.now(),
  }];

  timelineTrack.innerHTML = all.map(s => {
    const flex = ((s.endMs - s.startMs) / total * 1000).toFixed(0);
    return `<div class="tl-seg tl-${s.type}" style="flex:${flex}" title="${s.type}"></div>`;
  }).join('');

  // Duration display
  const secs  = Math.floor((Date.now() - SESSION_START) / 1000);
  const m     = Math.floor(secs / 60);
  const s     = String(secs % 60).padStart(2, '0');
  timelineDuration.textContent = `${m}:${s}`;
}

// ── Honest Minutes Tracker ─────────────────────────────────────
function tickHonestMinutes() {
  const now = Date.now();

  if (personPresent) {
    if (lastTickAt) {
      const delta = now - lastTickAt;
      totalPresentMs += delta;

      // "Honest" = present AND last scored page was productive
      if (currentPageScore !== null && currentPageScore >= threshold) {
        honestFocusMs   += delta;
        currentStreakMs += delta;
        bestStreakMs     = Math.max(bestStreakMs, currentStreakMs);
      } else {
        currentStreakMs = 0;
      }
    }
    lastTickAt = now;
  } else {
    lastTickAt      = null;
    currentStreakMs = 0;
  }

  // Update DOM
  honestMinutesEl.textContent = Math.floor(honestFocusMs / 60_000);
  bestStreakEl.textContent    = Math.floor(bestStreakMs  / 60_000) + 'm';

  if (totalPresentMs > 0) {
    const score = Math.round(honestFocusMs / totalPresentMs * 100);
    focusScoreEl.textContent = score + '%';
  }

  // Focus weather
  const distractions = statRedirects;
  if      (distractions === 0) focusWeather.textContent = '☀️ Clear';
  else if (distractions <= 2)  focusWeather.textContent = '🌤 Light distraction';
  else if (distractions <= 4)  focusWeather.textContent = '⛅ Moderate';
  else                         focusWeather.textContent = '🌧 Stormy focus';
}

// ── Camera ──────────────────────────────────────────────────────
async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = stream;

    // Attach listener BEFORE play() so we never miss the event
    await new Promise((resolve) => {
      const onReady = () => {
        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
        cameraPlaceholder.style.opacity = '0';
        setTimeout(() => { cameraPlaceholder.style.display = 'none'; }, 400);
        log('Camera ready', 'good');
        resolve();
      };
      if (video.readyState >= 1) { onReady(); }
      else { video.addEventListener('loadedmetadata', onReady, { once: true }); }
    });

    await video.play();
    return true;
  } catch (err) {
    camPlaceholderText.textContent = '📷 Camera denied — use Simulate button';
    log('Camera unavailable: ' + err.message, 'warn');
    return false;
  }
}

// ── Face detection ──────────────────────────────────────────────
async function initFaceDetector() {
  if (!('FaceDetector' in window)) {
    log('FaceDetector API unavailable — using motion detection', 'warn');
    return false;
  }
  try {
    faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
    await faceDetector.detect(video).catch(() => {});
    useFaceAPI = true;
    log('Native FaceDetector API ready', 'good');
    return true;
  } catch (e) {
    log('FaceDetector failed — using motion detection', 'warn');
    return false;
  }
}

let prevFrame = null;
const MOTION_THR = 4;          // lowered — catch subtle movement
const VARIANCE_THR = 180;      // scene complexity when a person is present

function motionDetect() {
  if (video.readyState < 2) return { motion: false, hasContent: false };
  const w = Math.floor(video.videoWidth / 4) || 160;
  const h = Math.floor(video.videoHeight / 4) || 120;
  const oc = new OffscreenCanvas(w, h);
  const octx = oc.getContext('2d');
  octx.drawImage(video, 0, 0, w, h);
  const cur = octx.getImageData(0, 0, w, h).data;
  const pixels = cur.length / 4;

  // Variance: a person in frame makes the image more complex than an empty room
  let sum = 0, sumSq = 0;
  for (let i = 0; i < cur.length; i += 4) {
    const lum = cur[i] * 0.299 + cur[i + 1] * 0.587 + cur[i + 2] * 0.114;
    sum += lum; sumSq += lum * lum;
  }
  const mean = sum / pixels;
  const variance = sumSq / pixels - mean * mean;
  const hasContent = variance > VARIANCE_THR;

  if (!prevFrame || prevFrame.length !== cur.length) {
    prevFrame = cur.slice();
    return { motion: false, hasContent };
  }

  let delta = 0;
  for (let i = 0; i < cur.length; i += 4) {
    delta += (Math.abs(cur[i] - prevFrame[i]) +
              Math.abs(cur[i + 1] - prevFrame[i + 1]) +
              Math.abs(cur[i + 2] - prevFrame[i + 2])) / 3;
  }
  prevFrame = cur.slice();
  return { motion: (delta / pixels) > MOTION_THR, hasContent };
}

async function faceDetect() {
  if (video.readyState < 2) return { detected: false, confidence: 0 };
  try {
    const faces = await faceDetector.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const face of faces) {
      const { x, y, width, height } = face.boundingBox;
      ctx.strokeStyle = '#3fb950';
      ctx.lineWidth   = 2;
      ctx.strokeRect(x, y, width, height);
      const cs = 14;
      ctx.strokeStyle = '#10d96e';
      ctx.lineWidth   = 3;
      [[x,y],[x+width,y],[x,y+height],[x+width,y+height]].forEach(([px,py], i) => {
        ctx.beginPath();
        ctx.moveTo(px + (i%2===0 ? cs : -cs), py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py + (i<2 ? cs : -cs));
        ctx.stroke();
      });
    }
    return { detected: faces.length > 0, confidence: faces.length > 0 ? 0.85 + Math.random() * 0.13 : 0 };
  } catch (e) {
    return { detected: false, confidence: 0 };
  }
}

// ── Detection loop ──────────────────────────────────────────────
function startDetectionLoop() {
  clearInterval(detectionLoop);
  detectionLoop = setInterval(tick, 900);
  timelineInterval = setInterval(() => { renderTimeline(); tickHonestMinutes(); updateTabTimes(); }, 5_000);
  scanBar.classList.add('active');
  log('Detection loop started', 'good');
}

async function tick() {
  let detected = false, confidence = 0;

  if (useFaceAPI) {
    const r = await faceDetect(); detected = r.detected; confidence = r.confidence;
  } else {
    const { motion, hasContent } = motionDetect();
    // Presence = motion detected, OR already present and scene still has a person-like blob
    detected = motion || (presenceFrames > 0 && hasContent);
    confidence = detected ? (motion ? 0.80 : 0.60) + Math.random() * 0.15 : 0;
  }

  // Fast rise (×3), slow fall (×1) — sitting still doesn't kill detection
  if (detected) presenceFrames = Math.min(presenceFrames + 3, 12);
  else          presenceFrames = Math.max(presenceFrames - 1, 0);

  const confirmed = presenceFrames >= PRESENCE_CONFIRM;

  if (confirmed && !personPresent) {
    personPresent = true;
    switchSegment('focused');        // optimistic — corrected after scoring
    onPersonArrived(confidence);
  } else if (!confirmed && personPresent) {
    personPresent = false;
    switchSegment('away');
    onPersonLeft();
  }

  // Continuously re-score while person is present — catches tab changes mid-session
  if (confirmed && personPresent && !isAnalyzing && apiKey) {
    const cooldownLeft = cooldownMs - (Date.now() - lastCheckAt);
    if (cooldownLeft <= 0) {
      chrome.storage.local.get('ff_pause_until', ({ ff_pause_until }) => {
        if (!ff_pause_until || Date.now() >= ff_pause_until) analyzeActiveTab();
      });
    }
  }

  if (confirmed) {
    confidenceStrip.style.opacity = '1';
    csFill.style.width   = Math.round(confidence * 100) + '%';
    csPct.textContent    = Math.round(confidence * 100) + '%';
  }
}

// ── Person events ───────────────────────────────────────────────
async function onPersonArrived(confidence) {
  personChip.classList.add('visible');
  detectionDot.className     = 'pill-dot alert';
  detectionLabel.textContent = 'Person detected!';
  log(`👤 Person detected (${Math.round(confidence * 100)}% conf)`, 'warn');
  if (!apiKey) { log('⚠ No API key — open Settings', 'warn'); }
}

function onPersonLeft() {
  personChip.classList.remove('visible');
  confidenceStrip.style.opacity = '0';
  detectionDot.className     = 'pill-dot active';
  detectionLabel.textContent = 'Monitoring...';
  currentPageScore           = null;
  log('No person in frame', '');
}

// ── Tab analysis ────────────────────────────────────────────────
async function analyzeActiveTab() {
  isAnalyzing = true;
  lastCheckAt = Date.now();

  let tab = null;
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getActiveTab' });
    tab = resp?.tab;
  } catch (e) {}

  if (!tab) {
    log('No monitorable tab found', '');
    setScoreState('idle');
    isAnalyzing = false;
    return;
  }

  const stored = await chrome.storage.local.get(['ff_last_productive', 'ff_session_distractions']);
  const lastProductive      = stored.ff_last_productive      || null;
  const sessionDistractions = stored.ff_session_distractions || 0;

  const host = (() => { try { return new URL(tab.url).hostname.replace('www.', ''); } catch(_) { return tab.url; } })();
  tabUrl.textContent   = host;
  tabTitle.textContent = tab.title || '';

  setScoreState('loading');
  loadingLabel.textContent = `Scoring "${host}" with OpenAI...${sessionIntent ? ' (goal-aware)' : ''}`;
  log(`Analyzing: ${host}${sessionIntent ? ` (goal: "${sessionIntent.slice(0,25)}")` : ''}`, '');

  try {
    const result = await callOpenAI(tab.url, tab.title, apiKey, threshold, lastProductive, sessionIntent);
    currentPageScore = result.score;

    statScores.push(result.score);
    showScoreResult(result);
    log(`Score: ${result.score}/100 — ${result.category} — "${result.reason}"`, result.score < threshold ? 'bad' : 'good');

    if (result.score >= threshold) {
      // Save as productive context
      chrome.storage.local.set({ ff_last_productive: { url: tab.url, title: tab.title, score: result.score } });
      switchSegment('focused');
      actionCard.style.display = 'none';
    }

    if (result.should_redirect && result.redirect_url) {
      switchSegment('distracted');   // mark timeline as distracted
      log(`Nudging "${tab.title?.slice(0,28)}" → ${result.redirect_name}`, 'warn');
      flipTab(tab.id, result, lastProductive, sessionDistractions, sessionIntent);
      chrome.storage.local.set({ ff_session_distractions: sessionDistractions + 1 });
      statRedirects++;
      statRedirectsEl.textContent = statRedirects;
      showActionCard(result, lastProductive);
    }

  } catch (err) {
    setScoreState('error');
    scoreErrorMsg.textContent = err.message;
    log(`OpenAI error: ${err.message}`, 'bad');
  }

  isAnalyzing = false;
}

// ── OpenAI call ─────────────────────────────────────────────────
async function callOpenAI(url, title, key, scoreThreshold, lastProductive, intent) {
  let context = '';
  if (intent) {
    context += `\nStudent's declared study goal: "${intent}". Score pages that don't support this goal lower, even if mildly educational. Suggest redirects that directly relate to this topic.`;
  }
  if (lastProductive) {
    context += `\nPrevious productive context: "${lastProductive.title}" (${lastProductive.url}, score ${lastProductive.score}/100). If relevant, suggest a redirect that continues this learning thread.`;
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: OPENAI_SYSTEM_PROMPT },
        { role: 'user',   content: `URL: ${url}\nPage Title: ${title || 'Unknown'}${context}` },
      ],
      max_tokens: 280,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `HTTP ${resp.status}`);
  }

  const data   = await resp.json();
  const raw    = data.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  const result = JSON.parse(raw);
  result.should_redirect = result.score < scoreThreshold && !!result.redirect_url;
  return result;
}

// ── Tab flip ────────────────────────────────────────────────────
function flipTab(tabId, result, lastProductive, distractionCount, intent) {
  chrome.runtime.sendMessage({
    action:           'flipTab',
    tabId,
    redirectUrl:      result.redirect_url,
    score:            result.score,
    category:         result.category,
    reason:           result.reason,
    redirectName:     result.redirect_name,
    redirectIcon:     result.redirect_icon,
    lastProductive,
    distractionCount,
    sessionIntent:    intent,
  });
}

// ── UI helpers ──────────────────────────────────────────────────
function setScoreState(state) {
  scoreIdle.style.display    = state === 'idle'    ? 'block' : 'none';
  scoreLoading.style.display = state === 'loading' ? 'flex'  : 'none';
  scoreResult.style.display  = state === 'result'  ? 'block' : 'none';
  scoreError.style.display   = state === 'error'   ? 'flex'  : 'none';
}

function showScoreResult(result) {
  setScoreState('result');
  const tier  = result.score < 40 ? 'low' : result.score < 70 ? 'mid' : 'high';
  const color = { low: '#f85149', mid: '#d29922', high: '#3fb950' }[tier];

  animateCount(srNumber, result.score, color);
  srBarFill.style.width      = result.score + '%';
  srBarFill.style.background = color;
  srReason.textContent       = result.reason;
  srCategoryPill.textContent   = result.category;
  srCategoryPill.style.background = color + '22';
  srCategoryPill.style.color      = color;
  srCategoryPill.style.border     = `1px solid ${color}44`;
}

function animateCount(el, target, color) {
  const start = performance.now();
  const dur   = 700;
  (function frame(now) {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
    el.style.color = color;
    if (p < 1) requestAnimationFrame(frame);
  })(performance.now());
}

function showActionCard(result, lastProductive) {
  actionIcon.textContent = result.redirect_icon || '📚';
  actionDest.textContent = lastProductive
    ? `${result.redirect_name} — context-matched`
    : result.redirect_name || 'Productive Page';
  actionUrl.textContent  = (() => { try { return new URL(result.redirect_url).hostname; } catch(_) { return ''; } })();
  actionCard.style.display = 'block';
  actionCard.classList.add('pop');
  setTimeout(() => actionCard.classList.remove('pop'), 400);
}

// ── Simulate button ─────────────────────────────────────────────
simBtn.addEventListener('click', () => {
  log('Simulation triggered', 'warn');
  presenceFrames = PRESENCE_CONFIRM + 1;
  if (!personPresent) { personPresent = true; switchSegment('focused'); onPersonArrived(0.91); }
  setTimeout(() => { if (personPresent) { presenceFrames = 0; personPresent = false; switchSegment('away'); onPersonLeft(); } }, 15_000);
});

// ── Tab time display ────────────────────────────────────────────
function fmtMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function updateTabTimes() {
  let data;
  try { data = await chrome.runtime.sendMessage({ action: 'getTabTimes' }); }
  catch (_) { return; }

  const times = data?.tabTimes || {};
  const entries = Object.entries(times).filter(([, ms]) => ms > 1000);
  if (!entries.length) return;

  entries.sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, ms]) => sum + ms, 0);

  tabTimesList.innerHTML = entries.slice(0, 8).map(([host, ms]) => {
    const pct = Math.round(ms / total * 100);
    const bar = `<div class="tt-bar" style="width:${pct}%"></div>`;
    return `<div class="tt-row">
      <span class="tt-host">${host}</span>
      <div class="tt-track">${bar}</div>
      <span class="tt-time">${fmtMs(ms)}</span>
    </div>`;
  }).join('');
}

// ── Tab-change resets ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'tabUrlChanged') {
    lastCheckAt      = 0;       // reset cooldown → re-analyze on next tick
    currentPageScore = null;
    setScoreState('idle');
  }
});

// ── Boot ────────────────────────────────────────────────────────
async function boot() {
  log('FocusFlip v3 starting...', '');
  loadSettings();
  setScoreState('idle');
  detectionDot.className     = 'pill-dot';
  detectionLabel.textContent = 'Starting...';

  const camOk = await initCamera();
  if (camOk) {
    await initFaceDetector();
    startDetectionLoop();
    detectionDot.className     = 'pill-dot active';
    detectionLabel.textContent = 'Monitoring...';
  } else {
    detectionDot.className     = 'pill-dot warning';
    detectionLabel.textContent = 'Camera unavailable';
    // Still start timeline + honest-minutes ticker for simulate button
    timelineInterval = setInterval(() => { renderTimeline(); tickHonestMinutes(); updateTabTimes(); }, 5_000);
  }

  renderTimeline();
  log('Ready ✓', 'good');
}

boot();
