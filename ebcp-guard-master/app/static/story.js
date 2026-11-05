// Story page: live demos first, motion second. Everything works with the motion section removed.

const $ = (id) => document.getElementById(id);
const motionOk = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
let lenis = null;

const relayout = () => { if (window.ScrollTrigger) ScrollTrigger.refresh(); };

// ---- What each action means, read by the five answers block ----
const VERDICTS = {
  ALLOW: ['Allowed through', 'Nothing here needed protecting under this policy.'],
  MASK: ['Masked', 'Identifying characters were removed. Masked values cannot be restored from the output.'],
  TOKENIZE: ['Tokenized', 'Sensitive values became tokens tied to this tenant, purpose and time period. Tokens cannot be reversed without the secret key.'],
  ENCRYPT: ['Encrypted', 'Sensitive values were encrypted with AES-256-GCM. Only an authorized service can read them. Try that in Chapter 04.'],
  BLOCK: ['Blocked', 'This destination may not receive this data. Nothing was sent onward.'],
};

// ---- Break It ----
const ATTACKS = [
  ['audit_tamper', 'Edit the audit log', 'Can I cover my tracks?'],
  ['unauth_decrypt', 'Decrypt without permission', 'Can I read a value without rights?'],
  ['evasion', 'Disguise the data', 'Can I hide a value from the detector?'],
  ['plaintext_log', 'Read the logs', 'Can I read customer data from logs?'],
  ['dict_attack', 'Guess the hash', 'Can I reverse a token by guessing?'],
  ['cross_tenant', 'Link across systems', 'Can I match one customer between teams?'],
  ['cumulative', 'Add it up', 'Can many small requests add up?'],
  ['exfiltration', 'Send it outside', 'Can I send data to an outside service?'],
];

const OUTCOME_TITLE = { PROTECTED: 'The attack failed.', PARTIAL: 'Partly got through.', VULNERABLE: 'It got through.' };

const resultTitle = (data) => {
  const samples = data.details?.samples;
  const missed = samples ? samples.filter((s) => !s.matches_found).length : 0;
  return data.result === 'PARTIAL' && samples
    ? `Partly got through. ${samples.length - missed} of ${samples.length} found, ${missed} missed.`
    : OUTCOME_TITLE[data.result] || data.result;
};

function setAttackButtons(disabled) {
  document.querySelectorAll('.attack').forEach((b) => { b.disabled = disabled; });
}

function openSheet(question, data) {
  $('sheet-chip').replaceChildren(chip(data.result));
  const samples = data.details?.samples;
  $('sheet-title').textContent = resultTitle(data);
  $('sheet-question').textContent = question;
  $('sheet-baseline').textContent = data.baseline_outcome;
  $('sheet-guard').textContent = data.ebcp_guard_outcome;
  $('sheet-explain').textContent = data.explanation;

  const holder = $('sheet-samples');
  holder.replaceChildren();
  if (samples) {
    const table = el('table', 'samples');
    const head = el('tr');
    head.append(el('th', '', 'Disguised input'), el('th', '', 'Detector found'));
    head.querySelectorAll('th').forEach((th) => th.setAttribute('scope', 'col'));
    table.append(head);
    samples.forEach((s) => {
      const row = el('tr');
      row.append(el('td', '', s.input), el('td', '', s.matches_found ? s.entity_types.join(', ') : 'Missed'));
      table.append(row);
    });
    holder.append(table);
  }

  const sheet = $('attack-sheet');
  sheet.showModal();
  lenis?.stop();
  $('sheet-title').focus();
  if (window.gsap && motionOk()) gsap.from(sheet, { yPercent: 100, duration: .45, ease: 'power3.out', clearProps: 'transform' });
}

function closeSheet() {
  $('attack-sheet').close();
}

async function runAttack(scenario, name, question, button) {
  const list = $('live-stages');
  const pace = motionOk() ? 350 : 0; // the backend finishes in milliseconds; this only makes the steps readable
  list.replaceChildren();
  $('phone-title').textContent = name;
  $('phone-sheet').hidden = true;
  setAttackButtons(true);
  lastAttackButton = button;
  try {
    const res = await postJson(`${API}/simulate-attack/stream`, { scenario, tenant_id: DEMO_TENANT }, AbortSignal.timeout(30000));
    if (!res.ok) throw new Error(`The server returned HTTP ${res.status}.`);
    let result = null;
    for await (const event of readAttackEvents(res)) {
      if (event.stage === 'error') throw new Error(event.message);
      list.append(el('li', '', `+${event.elapsed_ms} ms  ${event.message}`));
      list.scrollTop = list.scrollHeight;
      if (event.stage === 'final_result') result = event.result;
      await new Promise((r) => setTimeout(r, pace));
    }
    if (!result) throw new Error('The server stopped before giving a result.');
    setAttackButtons(false);
    // Under 1024px the phone may be off screen, so the full result opens straight away.
    if (!window.matchMedia('(min-width: 1024px)').matches) { openSheet(question, result); return; }
    $('ps-chip').replaceChildren(chip(result.result));
    $('ps-title').textContent = resultTitle(result);
    $('ps-full').onclick = () => openSheet(question, result);
    $('phone-sheet').hidden = false;
    lastAttackButton = $('ps-full');
    $('ps-full').focus({ preventScroll: true });
  } catch (err) {
    list.append(el('li', '', err.name === 'TimeoutError' ? 'No response after 30 seconds.'
      : err instanceof TypeError ? 'Unable to reach the server.' : err.message));
    setAttackButtons(false);
    button.focus();
  } finally {
    relayout();
  }
}

let lastAttackButton = null;

function buildAttacks() {
  $('attacks').replaceChildren(...ATTACKS.map(([scenario, name, question]) => {
    const item = el('li');
    const button = el('button', 'attack');
    button.type = 'button';
    button.append(el('strong', '', name), el('span', '', question));
    button.addEventListener('click', () => runAttack(scenario, name, question, button));
    item.append(button);
    return item;
  }));
}

// Fills the phone in Chapter 01 from the live cumulative attack.
function showExposure({ per_request_analysis: requests, cumulative_analysis: total }) {
  const fill = (row, type, risk, action) => {
    row.dataset.risk = risk;
    row.querySelector('.er-type').textContent = type;
    row.querySelector('.er-score').textContent = risk;
    row.querySelector('.chip').replaceWith(chip(action));
  };
  [...$('expo-list').children].forEach((row, i) => fill(row, requests[i].entity_types.join(', '), requests[i].risk_score, requests[i].recommended_action));
  fill($('expo-total'), `${total.risk_level} RISK`, total.risk_score, total.recommended_action);
  // On the pinned layout, stay on whichever request the scroll has reached.
  $('expo-score').textContent = [...$('expo-list').children, $('expo-total')].filter((r) => !r.classList.contains('off')).pop().dataset.risk;
  $('expo-note').textContent = 'The gateway remembers what this customer has already exposed. Added together, the score reaches high risk and the decision changes. These scores came from the live server when this page loaded.';
}

// Every attack runs on load, so the scoreboard and log comparison are from this server, right now.
async function loadScoreboard() {
  try {
    const results = await Promise.all(ATTACKS.map(async ([scenario]) => {
      const res = await postJson(`${API}/simulate-attack`, { scenario, tenant_id: DEMO_TENANT });
      if (!res.ok) throw new Error();
      return res.json();
    }));
    const count = (r) => results.filter((x) => x.result === r).length;
    document.querySelectorAll('[data-score]').forEach((node) => {
      const value = count(node.dataset.score);
      node.textContent = value;
      if (window.gsap && motionOk()) {
        const n = { v: 0 };
        gsap.to(n, { v: value, duration: 1, snap: { v: 1 }, onUpdate: () => { node.textContent = n.v; },
          scrollTrigger: { trigger: '#score', start: 'top 85%', once: true } });
      }
    });
    $('score-note').textContent = `All ${results.length} attacks ran against this server when the page loaded. All data is made up.`;
    showExposure(results.find((x) => x.scenario === 'cumulative').details);
    const logs = results.find((x) => x.scenario === 'plaintext_log').details;
    $('log-baseline').textContent = logs.baseline_log;
    $('log-protected').textContent = logs.protected_log;
  } catch {
    $('score-note').textContent = 'The attacks could not run. Check that the server is running.';
    $('log-compare').replaceChildren(el('p', 'note', 'The log comparison could not load. Check that the server is running.'));
  }
}

async function runOwnCheck() {
  const text = $('own-input').value;
  const out = $('own-result');
  if (!text.trim()) { out.replaceChildren(el('span', 'note', 'Type something first.')); return; }
  $('own-run').disabled = true;
  try {
    const res = await postJson(`${API}/analyze`, { payload: { text }, endpoint: '/demo/disguise', tenant_id: DEMO_TENANT });
    if (res.status === 401) throw new Error('The live demo runs in development mode.');
    if (!res.ok) throw new Error(`The server returned HTTP ${res.status}.`);
    const types = [...new Set((await res.json()).detected_entities.map((e) => e.entity_type))];
    out.replaceChildren(...(types.length
      ? [el('span', '', 'Caught:'), ...types.map((t) => chip(t))]
      : [chip('MISSED'), el('span', '', 'Nothing detected. This disguise got past the detector.')]));
  } catch (err) {
    out.replaceChildren(el('span', 'note', err instanceof TypeError ? 'Unable to reach the server.' : err.message));
  } finally {
    $('own-run').disabled = false;
    relayout();
  }
}

// ---- Wiring ----
// The five policy actions. Outputs are in the real format of each action.
const ANSWERS = {
  ALLOW: ['amount 75000', '75000'],
  MASK: ['rohan.gupta@example.in', 'r*********a@example.in'],
  TOKENIZE: ['+919876543210', 'PHONE_861bccd30551160b6beae1'],
  ENCRYPT: ['123456789012', '[ENCRYPTED:AES256GCM_…]'],
  BLOCK: ['payload for untrusted_external', 'nothing is sent'],
};

function selectAnswer(action) {
  document.querySelectorAll('[data-totem-name]').forEach((n) => { n.textContent = action; });
  $('totem-index').textContent = `(${Object.keys(ANSWERS).indexOf(action) + 1})`;
  [$('totem-title').textContent, $('totem-text').textContent] = VERDICTS[action];
  [$('totem-in').textContent, $('totem-out').textContent] = ANSWERS[action];
  document.querySelectorAll('[data-action]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.action === action)));
  relayout();
}

mountReveal($('reveal-mount'), { onAttempt: relayout });

document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => selectAnswer(b.dataset.action)));
$('own-run').addEventListener('click', runOwnCheck);
$('sheet-close').addEventListener('click', closeSheet);
$('attack-sheet').addEventListener('close', () => { lenis?.start(); lastAttackButton?.focus(); });
$('attack-sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSheet(); });

buildAttacks();
fetch('/docs').then((r) => r.ok).catch(() => false).then((up) => {
  document.querySelectorAll('a[href="/docs"]').forEach((link) => { link.hidden = !up; });
});

// ---- Footer ----
const hoverMotion = () => motionOk() && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// The hairline bends toward the pointer, then wobbles back on release.
function setupString() {
  const svg = $('string');
  const path = svg.querySelector('path');
  let x = 50; let y = 50; let v = 0; let target = 50; let raf = 0;
  const stringTick = () => {
    raf = 0;
    v = (v + (target - y) * .12) * .88;
    y += v;
    if (Math.abs(target - y) + Math.abs(v) < .05) { y = target; v = 0; } else raf = requestAnimationFrame(stringTick);
    path.setAttribute('d', `M0 50 Q${x.toFixed(2)} ${(50 + (y - 50) * 2).toFixed(2)} 100 50`);
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(stringTick); };
  svg.addEventListener('pointermove', (e) => {
    if (!hoverMotion()) return;
    const box = svg.getBoundingClientRect();
    x = (e.clientX - box.left) / box.width * 100;
    target = (e.clientY - box.top) / box.height * 100;
    wake();
  });
  svg.addEventListener('pointerleave', () => { target = 50; wake(); });
}

// The pointer is the attacker: data backs away from it, and raw values turn masked as it gets close.
const PIECES = [
  { kind: 'stamp', x: 13, y: 33, s: 10, rot: -8, back: true, response: .85, mx: 13, my: 58, ms: 20 },
  { kind: 'card', cap: 'Email', raw: 'rohan.gupta@example.in', safe: 'r*********a@example.in', x: 47, y: 26, s: 20, rot: -6, back: true, response: 1.1, hideOnPhone: true },
  { kind: 'card', cap: 'Account number', raw: '123456789012', safe: '********9012', x: 26, y: 34, s: 15, rot: 7, response: 1, mx: 25, my: 30, ms: 36 },
  { kind: 'phone', x: 88, y: 46, s: 11, rot: 8, back: true, response: .95, mx: 89, my: 36, ms: 20 },
  { kind: 'card', cap: 'Aadhaar', raw: '4567 8901 2345', safe: 'XXXX XXXX 2345', x: 69, y: 30, s: 15, rot: -5, response: 1.25, mx: 66, my: 24, ms: 36 },
  { kind: 'sticker', text: 'Masked.', tone: 'air', x: 5, y: 12, s: 8, rot: -12, response: 1.15, mx: 10, my: 12, ms: 22 },
  { kind: 'sticker', text: 'Tokenized.', tone: 'ember', x: 36, y: 62, s: 9, rot: 11, response: 1.2, mx: 44, my: 58, ms: 22 },
  { kind: 'sticker', text: 'Encrypted.', tone: 'pale', x: 79, y: 14, s: 9, rot: 12, response: 1.1, mx: 70, my: 58, ms: 22 },
];

function buildPiece(piece) {
  const node = el('div', `piece piece-${piece.kind}${piece.back ? ' piece-back' : ''}${piece.hideOnPhone ? ' piece-hide' : ''}`);
  node.setAttribute('aria-hidden', 'true');
  [['--x', piece.x], ['--y', piece.y], ['--s', piece.s], ['--mx', piece.mx ?? piece.x], ['--my', piece.my ?? piece.y], ['--ms', piece.ms ?? piece.s]]
    .forEach(([name, value]) => node.style.setProperty(name, value));
  node.style.transform = `translate(-50%, -50%) rotate(${piece.rot}deg)`;
  if (piece.kind === 'stamp') node.append(el('i', 'crest'));
  if (piece.kind === 'sticker') node.append(el('i', `shield tone-${piece.tone}`), el('span', 'sticker-text', piece.text));
  if (piece.kind === 'phone') {
    const screen = el('div', 'phone-screen s-pale');
    screen.append(chip('ENCRYPT'));
    const phone = el('div', 'phone');
    phone.append(screen);
    node.append(phone);
  }
  if (piece.kind === 'card') {
    node.classList.add('s-ember');
    node.append(el('i', 'crest'), el('p', 'qcap', piece.cap), el('p', 'mono card-raw', piece.raw), el('p', 'mono card-safe', piece.safe));
  }
  return node;
}

function setupNudge() {
  const stage = $('mark-stage');
  const nodes = PIECES.map(buildPiece);
  stage.append(...nodes);
  const bodies = PIECES.map(() => ({ x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, safe: false }));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  let pointer = null; let raf = 0; let last = 0;

  const paint = (i) => {
    const b = bodies[i];
    nodes[i].style.transform = `translate(-50%, -50%) translate3d(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px, 0) rotate(${PIECES[i].rot + b.r}deg)`;
  };
  const setSafe = (i, safe) => {
    const b = bodies[i];
    if (PIECES[i].kind !== 'card' || b.safe === safe) return;
    b.safe = safe;
    nodes[i].classList.toggle('is-safe', safe);
    nodes[i].classList.toggle('s-ember', !safe);
    nodes[i].classList.toggle('s-ink', safe);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0; last = 0; pointer = null;
    bodies.forEach((b, i) => { b.x = b.y = b.r = b.vx = b.vy = b.vr = 0; paint(i); setSafe(i, false); });
  };
  const nudgeTick = (now) => {
    raf = 0;
    const dt = last ? clamp((now - last) / 1000, 1 / 240, 1 / 30) : 1 / 60;
    last = now;
    const { clientWidth: width, clientHeight: height } = stage;
    const phone = width <= 600;
    const scale = clamp(width / 1200, .4, 1.5);
    const range = 190 * scale;
    const friction = Math.exp(-15 * dt);
    let moving = false;
    bodies.forEach((b, i) => {
      const piece = PIECES[i];
      let tx = 0; let ty = 0; let tr = 0;
      if (pointer) {
        const dx = width * (phone ? piece.mx ?? piece.x : piece.x) / 100 - pointer.x;
        const dy = height * (phone ? piece.my ?? piece.y : piece.y) / 100 - pointer.y;
        const len = Math.hypot(dx, dy) || .1;
        if (len < range) {
          const force = Math.pow(1 - len / range, 1.35) * 120 * scale * piece.response;
          tx = dx / len * force;
          ty = dy / len * force;
          tr = clamp((tx - ty * .25) / (120 * scale), -1, 1) * 17;
        }
        setSafe(i, len < (bodies[i].safe ? range * 1.5 : range * 1.25));
      } else setSafe(i, false);
      b.vx = (b.vx + (tx - b.x) * 115 * dt) * friction;
      b.vy = (b.vy + (ty - b.y) * 115 * dt) * friction;
      b.vr = (b.vr + (tr - b.r) * 115 * dt) * friction;
      b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
      if (Math.abs(tx - b.x) + Math.abs(ty - b.y) + Math.abs(tr - b.r) + Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.vr) > .08) moving = true;
      else { b.x = tx; b.y = ty; b.r = tr; b.vx = b.vy = b.vr = 0; }
      paint(i);
    });
    if (moving) raf = requestAnimationFrame(nudgeTick); else last = 0;
  };
  const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(nudgeTick); } };

  // Without hover or motion, cards show both values, so nothing depends on the pointer.
  const syncLive = () => { stop(); stage.classList.toggle('nudge-live', hoverMotion()); };
  syncLive();
  ['(prefers-reduced-motion: no-preference)', '(hover: hover) and (pointer: fine)'].forEach((q) => window.matchMedia(q).addEventListener('change', syncLive));

  stage.addEventListener('pointermove', (e) => {
    if (!hoverMotion() || e.pointerType === 'touch') return;
    const box = stage.getBoundingClientRect();
    pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
    wake();
  });
  const leave = () => { pointer = null; wake(); };
  stage.addEventListener('pointerleave', leave);
  stage.addEventListener('pointercancel', leave);
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', stop);
  new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stop(); }).observe(stage);
  new ResizeObserver(stop).observe(stage);
}

setupString();
setupNudge();

// ---- Motion: GSAP drives animation and pinning, Lenis smooths the scroll. ----
function setupMotion() {
  if (!window.gsap || !window.ScrollTrigger || !motionOk()) return;
  gsap.registerPlugin(ScrollTrigger);

  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Hero headline
  const heading = document.querySelector('[data-split]');
  heading.setAttribute('aria-label', heading.textContent);
  [...heading.querySelectorAll('mark'), heading].forEach((holder) => {
    [...holder.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).forEach((node) => {
      const parts = node.textContent.split(/(\s+)/).map((part) => {
        if (!part.trim()) return part;
        const w = el('span', 'word', part);
        w.setAttribute('aria-hidden', 'true');
        return w;
      });
      node.replaceWith(...parts);
    });
  });
  gsap.from('.word', { y: 40, opacity: 0, duration: .8, stagger: .05, ease: 'power3.out', clearProps: 'all' });
  gsap.from('.hero .lede, .ring-stage', { y: 20, opacity: 0, duration: .7, delay: .45, stagger: .1, ease: 'power2.out', clearProps: 'all' });

  const mm = gsap.matchMedia();

  // Anything that pins needs room. Below these sizes the page simply scrolls.
  mm.add('(min-width: 768px) and (min-height: 680px)', () => {
    const root = document.documentElement;
    root.classList.add('motion', 'pinned-walk', 'motion-sheet');

    // 1. Hero: the ring turns and each card flips as it passes the front, then the ring collapses into one card.
    const heroTl = gsap.timeline({ scrollTrigger: { trigger: '#hero', pin: true, start: 'top top', end: '+=260%', scrub: .6 } });
    heroTl.to('.ring', { rotationY: -360, duration: .72, ease: 'none' }, 0);
    gsap.utils.toArray('.ring .qinner').forEach((inner, i) => {
      heroTl.to(inner, { rotationY: 180, duration: .1, ease: 'power1.inOut' }, i * .08);
    });
    heroTl.to('.ring', { '--spread': 0, duration: .12, ease: 'power2.in' }, .72)
      .to('.hero h1, .hero .lede', { opacity: 0, y: -30, duration: .1 }, .72)
      .to('.ring', { opacity: 0, duration: .04 }, .86)
      .fromTo('.qcard-one', { opacity: 0, scale: .7 }, { opacity: 1, scale: 1, duration: .08 }, .86)
      .to({}, { duration: .06 });

    // 2. Exposure: the giant score climbs behind the phone, request by request.
    const expoRows = [...gsap.utils.toArray('#expo-list li'), document.getElementById('expo-total')];
    const expoScore = document.getElementById('expo-score');
    let expoStep = -1;
    const setExpo = (i) => {
      if (i === expoStep) return;
      expoStep = i;
      expoRows.forEach((row, n) => row.classList.toggle('off', n > i));
      expoScore.textContent = expoRows[i].dataset.risk;
      expoScore.classList.toggle('final', i === expoRows.length - 1);
      gsap.fromTo(expoScore, { scale: .96 }, { scale: 1, duration: .25 });
    };
    setExpo(0);
    ScrollTrigger.create({
      trigger: '#expo', pin: true, start: 'top top', end: '+=220%',
      onUpdate: (self) => setExpo(Math.min(expoRows.length - 1, Math.floor(self.progress * expoRows.length))),
    });
    gsap.fromTo('.expo-rule', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#expo', start: 'top 60%', end: 'top top', scrub: true } });
    gsap.fromTo('#expo .phone, .stage-screen', { filter: 'blur(8px)' }, { filter: 'blur(0px)', ease: 'none', clearProps: 'filter', scrollTrigger: { trigger: '#expo', start: 'top 70%', end: 'top 10%', scrub: true } });

    // 3. Gateway: nine stages shown on the phone, pinned. Ends before the live demo.
    const stages = gsap.utils.toArray('.stages li');
    const count = document.querySelector('.stage-count');
    const panels = gsap.utils.toArray('.stage-panel');
    let current = -1;
    const setStage = (i) => {
      if (i === current) return;
      current = i;
      stages.forEach((s, n) => s.classList.toggle('on', n === i));
      count.textContent = `Step ${i + 1} of ${stages.length}`;
      panels.forEach((panel, n) => { panel.hidden = n !== i; });
      document.querySelector('.stage-name').textContent = stages[i].querySelector('strong').textContent;
      document.querySelector('.stage-num').textContent = String(i + 1).padStart(2, '0');
      document.querySelector('.stage-explain').textContent = stages[i].querySelector('span').textContent;
      gsap.fromTo(panels[i], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .3, overwrite: true });
    };
    setStage(0);
    ScrollTrigger.create({
      trigger: '.walk', pin: true, start: 'top top', end: '+=320%',
      onUpdate: (self) => setStage(Math.min(stages.length - 1, Math.floor(self.progress * stages.length))),
    });

    // 6. Logs: a light sheet slides over Reveal, then settles flat. Reveal holds only after its form has passed.
    ScrollTrigger.create({ trigger: '#reveal', start: 'bottom bottom', endTrigger: '#logs', end: 'top top', pin: true, pinSpacing: false });
    gsap.fromTo('#logs', { rotation: 2, y: 40 }, {
      rotation: 0, y: 0, ease: 'none',
      scrollTrigger: { trigger: '#logs', start: 'top bottom', end: 'top top', scrub: true },
    });

    return () => {
      root.classList.remove('motion', 'pinned-walk', 'motion-sheet');
      expoRows.forEach((row) => row.classList.remove('off'));
      expoScore.classList.remove('final');
      expoScore.textContent = document.getElementById('expo-total').dataset.risk;
      expoStep = -1;
      current = -1;
    };
  });

  // Effects that only need scrolling, on every screen size.
  gsap.utils.toArray('.row').forEach((row) => {
    gsap.from(row, {
      clipPath: 'inset(0 30% 0 30%)', opacity: .2, ease: 'none',
      scrollTrigger: { trigger: row, start: 'top 95%', end: 'top 65%', scrub: true },
      clearProps: 'clipPath,opacity',
    });
  });
  gsap.to('.coin', { rotationY: 720, ease: 'none', scrollTrigger: { trigger: '.totem', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.to('.totem', { scale: .92, ease: 'none', scrollTrigger: { trigger: '.totem', start: 'bottom 80%', end: 'bottom 30%', scrub: true } });
  // The pill drifts across the opening only. Pinned chapters keep text near the bottom edge, where it would cover words.
  gsap.fromTo('.float-pill', { x: '-28vw' }, { x: '28vw', ease: 'none', scrollTrigger: {
    start: 0, endTrigger: '#expo', end: 'top bottom', scrub: true, toggleClass: { targets: '.float-pill', className: 'on' },
  } });
  gsap.from('.attack', {
    y: 20, opacity: 0, stagger: .05, duration: .4, clearProps: 'all',
    scrollTrigger: { trigger: '.break-grid', start: 'top 90%', once: true },
  });
  gsap.fromTo('#reveal', { clipPath: 'inset(9% 0% 0% 0% round 40px 40px 0 0)' }, {
    clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0 0)', ease: 'none',
    scrollTrigger: { trigger: '#reveal', start: 'top bottom', end: 'top 25%', scrub: true },
  });
  gsap.from('[data-cta]', {
    scale: 1.08, transformOrigin: 'left center', ease: 'none',
    scrollTrigger: { trigger: '#cta', start: 'top bottom', end: 'top 30%', scrub: true },
  });

  document.fonts?.ready.then(relayout);
}

// ---- Nav bar: ThreeUI's dock, plus a pill that follows the chapter on screen. ----
const dockOptions = { proximity: 122, spring: 0.19, damping: 0.7, widthGrowth: 17, heightGrowth: 16, drop: 3.5, axis: 'x', distribute: false, lockTrack: true };
createTopDockController(document.querySelector('.atd-modern__dock'), () => dockOptions);

const dockLinks = document.querySelectorAll('.atd-modern__item');
const chapterWatch = new IntersectionObserver((entries) => {
  entries.filter((entry) => entry.isIntersecting).forEach(({ target }) => {
    dockLinks.forEach((link) => {
      if (link.hash === `#${target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-50% 0px -50% 0px' });
document.querySelectorAll('main > section, .site-foot').forEach((part) => chapterWatch.observe(part));

setupMotion();
loadScoreboard();
