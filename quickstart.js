/* SPLITSTEEL demo
   Replays the recorded screens of one sitting and fills in the cards on the
   table as the screens ask for it. Every frame was drawn by the program itself
   and every card state follows the values that sitting really used.
   Nothing on this page talks to a network. */

import demo from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const HEX = "0123456789abcdef";

/* ---------------------------------------------------------------- nav (as the other pages) */
{
  const nav = $("#nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", scrollY > 24);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { rootMargin: "0px 0px -8% 0px" }
  );
  $$(".rev").forEach((el) => io.observe(el));
  setTimeout(() => $$(".rev").forEach((el) => el.classList.add("in")), 4000);
}

/* ---------------------------------------------------------------- the player */
const term = $("#term");
const capEl = $("#cap");
const keysEl = $("#keys");
const chapters = $("#chapters");
const playBtn = $("#play");
const prevBtn = $("#prev");
const nextBtn = $("#next");
const speedSel = $("#speed");
const prog = $("#prog");
const counter = $("#counter");
const epTitle = $("#ep-title");
const epBlurb = $("#ep-blurb");
const tabsEl = $("#tabs");
const cardView = $("#cardview");
const cardNote = $("#cardnote");

$$("[data-build]").forEach((el) => (el.textContent = demo.build));
$$("[data-values]").forEach((el) => (el.textContent = demo.values[el.dataset.values] || ""));
const WORDS = demo.values.words.split(" ");

const st = { ep: 0, step: 0, typed: 0, playing: false, timer: 0, cap: "", pinned: null, tab: "seed" };

const speedFactor = () => Number(speedSel.value) || 1;
/* how long a screen stays before the keys are typed: longer when there is a
   new caption to read - roughly a second per twelve words */
function HOLD(s) {
  if (s.hold) return s.hold * 1000;
  if (s.fast) return 450;
  const words = s.cap ? s.cap.split(/\s+/).length : 0;
  return 2600 + words * 85;
}
const PER_KEY = (s) => (s.fast ? 55 : 110);

function line(spans) {
  const frag = document.createDocumentFragment();
  for (const [cls, text] of spans) {
    if (!cls) { frag.appendChild(document.createTextNode(text)); continue; }
    const sp = document.createElement("span");
    sp.className = cls;
    sp.textContent = text;
    frag.appendChild(sp);
  }
  return frag;
}

/* ---------------------------------------------------------------- the cards */
const TABS = [
  ["seed", "Seed grid card"],
  ["dice", "Dice card"],
  ["xor", "Arithmetic card"],
  ["paper", "Your paper"],
  ["numbers", "Three numbers"],
  ["words", "The words"],
];

function checkGroup(hex) {
  let x = 0;
  for (let i = 0; i + 4 <= hex.length; i += 4) x ^= parseInt(hex.slice(i, i + 4), 16);
  return x.toString(16).padStart(4, "0");
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* one 4+4+check grid of paper boxes, the shape of the SEED GRID CARD. hex is
   what is written so far: a full group fills a box, a partial one is being
   written. Box 8 is the check group, filled once all eight are there. */
function grid(label, hex, cls, opts = {}) {
  const wrap = el("div", "pg " + cls);
  wrap.appendChild(el("div", "pg-label", label));
  const boxes = el("div", "pg-boxes");
  for (let i = 0; i < 9; i++) {
    if (i === 4) boxes.appendChild(el("div", "pg-spacer"));
    const b = el("div", "pg-box");
    let text = "";
    if (i < 8) text = hex.slice(i * 4, i * 4 + 4).toUpperCase();
    else if (hex.length >= 32) text = checkGroup(hex.slice(0, 32)).toUpperCase();
    b.appendChild(el("span", "pg-n", i < 8 ? String(i + 1) : "check"));
    b.appendChild(el("span", "pg-v", text));
    if (text.length === 4) b.classList.add("on");
    if ((text.length > 0 && text.length < 4) || opts.fill === i) b.classList.add("writing");
    if (opts.cur === i) b.classList.add("cur");
    if (opts.wrong && opts.wrong.includes(i)) b.classList.add("bad");
    boxes.appendChild(b);
  }
  wrap.appendChild(boxes);
  return wrap;
}

function renderSeedCard(k) {
  const f = document.createDocumentFragment();
  f.appendChild(el("p", "card-title", "SEED GRID CARD"));
  f.appendChild(grid("A  the machine's number", k.a || "", "pg-in", { cur: k.cur }));
  f.appendChild(grid("B  your dice", k.b || "", "pg-in", { cur: k.cur, fill: k.bcur }));
  f.appendChild(grid("C  the new seed  =  A combined with B", k.c || "", "pg-seed", { cur: k.cur, wrong: k.wrong }));
  return f;
}

function renderDiceCard(k) {
  const f = document.createDocumentFragment();
  f.appendChild(el("p", "card-title", "DICE CARD  ·  first die down, second die across"));
  const t = el("table", "dice");
  const tb = el("tbody");
  t.appendChild(tb);
  const head = el("tr");
  head.appendChild(el("th", "", ""));
  for (let d2 = 1; d2 <= 6; d2++) head.appendChild(el("th", "", String(d2)));
  tb.appendChild(head);
  const [h1, h2] = k.dice || [0, 0];
  for (let d1 = 1; d1 <= 6; d1++) {
    const tr = el("tr");
    tr.appendChild(el("th", d1 === h1 ? "hl" : "", String(d1)));
    for (let d2 = 1; d2 <= 6; d2++) {
      const n = (d1 - 1) * 6 + (d2 - 1);
      const td = el("td", n >= 32 ? "reroll" : "", n >= 32 ? "again" : HEX[n % 16].toUpperCase());
      if (d1 === h1 && d2 === h2) td.classList.add("hit");
      else if (d1 === h1 || d2 === h2) td.classList.add("hl");
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  f.appendChild(t);
  if (k.dice) {
    const n = (h1 - 1) * 6 + (h2 - 1);
    f.appendChild(el("p", "card-read", `first die ${h1}, second die ${h2}  →  ${n >= 32 ? "roll both again" : HEX[n % 16].toUpperCase()}`));
  } else {
    f.appendChild(el("p", "card-read", "two casino dice, two colours, one character a throw; the four corners are rerolls"));
  }
  return f;
}

/* the box being worked on, as it sits on the SEED GRID CARD or the paper, so
   the eye does not have to leave the table to see what is being combined */
function boxRow(k) {
  const row = el("div", "box-row");
  const add = (label, hex, i, cls, extra) => {
    const b = el("div", "pg-box " + cls + (extra || ""));
    b.appendChild(el("span", "pg-n", label));
    b.appendChild(el("span", "pg-v", hex ? hex.slice(i * 4, i * 4 + 4).toUpperCase() : ""));
    if (hex && hex.length >= (i + 1) * 4) b.classList.add("on");
    row.appendChild(b);
  };
  if (k.cur !== undefined && k.a && k.b) {
    add("A" + (k.cur + 1), k.a, k.cur, "pg-in-box");
    row.appendChild(el("span", "box-op", "+"));
    add("B" + (k.cur + 1), k.b, k.cur, "pg-in-box");
    row.appendChild(el("span", "box-op", "="));
    add("C" + (k.cur + 1), k.c, k.cur, "pg-seed-box", k.wrong && k.wrong.includes(k.cur) ? " bad" : "");
    return row;
  }
  if (k.ncur !== undefined && k.n1 && k.n2 && k.n3 && k.x) {
    add("1", k.n1, k.ncur, "pg-in-box");
    row.appendChild(el("span", "box-op", "·"));
    add("2", k.n2, k.ncur, "pg-in-box");
    row.appendChild(el("span", "box-op", "·"));
    add("3", k.n3, k.ncur, "pg-seed-box");
    return row;
  }
  if (k.pcur !== undefined && k.ccur !== undefined && k.pad && k.cip) {
    add("pad " + (k.pcur + 1), k.pad, k.pcur, "pg-pad-box");
    row.appendChild(el("span", "box-op", "·"));
    add("cipher " + (k.ccur + 1), k.cip, k.ccur, "pg-cip-box");
    return row;
  }
  return null;
}

function renderXorCard(k) {
  const f = document.createDocumentFragment();
  f.appendChild(el("p", "card-title", "ARITHMETIC CARD  ·  row meets column"));
  const br = boxRow(k);
  if (br) f.appendChild(br);
  const pairs = k.x || [];
  const rows = new Set(pairs.map((p) => p[0].toLowerCase()));
  const cols = new Set(pairs.map((p) => p[1].toLowerCase()));
  const hits = new Set(pairs.map((p) => p[0].toLowerCase() + p[1].toLowerCase()));
  const t = el("table", "xor");
  const tb = el("tbody");
  t.appendChild(tb);
  const head = el("tr");
  head.appendChild(el("th", "", ""));
  for (const c of HEX) head.appendChild(el("th", cols.has(c) ? "hl" : "", c.toUpperCase()));
  tb.appendChild(head);
  for (const r of HEX) {
    const tr = el("tr");
    tr.appendChild(el("th", rows.has(r) ? "hl" : "", r.toUpperCase()));
    for (const c of HEX) {
      const v = (parseInt(r, 16) ^ parseInt(c, 16)).toString(16).toUpperCase();
      const td = el("td", "", v);
      if (hits.has(r + c)) td.classList.add("hit");
      else if (rows.has(r) || cols.has(c)) td.classList.add("hl");
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  f.appendChild(t);
  if (pairs.length) {
    const read = pairs.map(([r, c]) => `${r.toUpperCase()} meets ${c.toUpperCase()} → ${(parseInt(r, 16) ^ parseInt(c, 16)).toString(16).toUpperCase()}`).join("   ");
    f.appendChild(el("p", "card-read", read));
  } else {
    f.appendChild(el("p", "card-read", "printed, never on a screen: a table this machine drew is a table it could bend"));
  }
  return f;
}

function renderPaper(k) {
  const f = document.createDocumentFragment();
  f.appendChild(el("p", "card-title", "YOUR PAPER  ·  the two halves, written exactly"));
  const padLen = (k.pad || "").length;
  f.appendChild(grid("THE RED PAD", k.pad || "", "pg-pad", { cur: padLen >= 32 ? k.pcur : undefined, fill: padLen < 32 ? k.pcur : undefined }));
  f.appendChild(grid("THE BLUE CIPHERTEXT", k.cip || "", "pg-cip", { cur: k.ccur }));
  return f;
}

function renderNumbers(k) {
  const f = document.createDocumentFragment();
  f.appendChild(el("p", "card-title", "THREE PARTS  ·  the three numbers on your paper"));
  const opts = (n) => ({ cur: k.nwhich === n ? k.ncur : undefined, fill: k.nwhich === n && (k["n" + n] || "").length < 32 ? k.ncur : undefined });
  f.appendChild(grid("NUMBER 1  ·  your dice", k.n1 || "", "pg-in", opts(1)));
  f.appendChild(grid("NUMBER 2  ·  rolled at the table", k.n2 || "", "pg-in", opts(2)));
  f.appendChild(grid("NUMBER 3  ·  the seed combined with 1 and 2", k.n3 || "", "pg-seed", opts(3)));
  f.appendChild(el("p", "card-read", "RED = 1 and 2 · BLUE = 2 and 3 · GREEN = 3 and 1 · any two parts hold all three"));
  return f;
}

function renderWords(k) {
  const f = document.createDocumentFragment();
  f.appendChild(el("p", "card-title", "THE PAPER SEED  ·  twelve words, in order"));
  const ol = el("ol", "wordlist");
  for (let i = 0; i < 12; i++) {
    const li = el("li", "", k.w ? WORDS[i] : "");
    if (!k.w) li.classList.add("blank");
    if (k.wcur === i) li.classList.add("cur");
    ol.appendChild(li);
  }
  f.appendChild(ol);
  f.appendChild(el("p", "card-read", k.w ? "written down, then read back word by word" : "nothing yet: the words come after the arithmetic check"));
  return f;
}

const RENDER = { seed: renderSeedCard, dice: renderDiceCard, xor: renderXorCard, paper: renderPaper, numbers: renderNumbers, words: renderWords };

function hasContent(tab, k) {
  if (tab === "seed") return !!(k.a || k.b || k.c);
  if (tab === "dice") return !!k.dice;
  if (tab === "xor") return !!(k.x && k.x.length);
  if (tab === "paper") return !!(k.pad || k.cip);
  if (tab === "numbers") return !!(k.n1 || k.n2 || k.n3);
  if (tab === "words") return !!k.w;
  return false;
}

function lastK(ep) {
  for (let i = ep.steps.length - 1; i >= 0; i--) if (ep.steps[i].k) return ep.steps[i].k;
  return {};
}

/* the panel shows the previous step's content until this step's keys are in,
   and this step's highlights throughout: the pencil moves as you type */
function renderCards() {
  const ep = demo.episodes[st.ep];
  const s = ep.steps[st.step];
  const cur = s.k || {};
  const prev = st.step > 0 ? (ep.steps[st.step - 1].k || {}) : (st.ep > 0 ? lastK(demo.episodes[st.ep - 1]) : {});
  const done = st.typed >= (s.keys || "").length;
  const k = done ? { ...cur } : { ...prev };
  for (const h of ["cur", "bcur", "pcur", "ccur", "wcur", "ncur", "nwhich", "x", "dice", "wrong"]) {
    if (cur[h] !== undefined) k[h] = cur[h]; else if (!done) delete k[h];
  }
  if (done && cur.wrong === undefined) delete k.wrong;

  const tab = st.pinned || cur.tab || st.tab;
  st.tab = tab;
  $$("#tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.classList.toggle("has", hasContent(b.dataset.tab, k));
  });
  cardView.replaceChildren(RENDER[tab](k));
  cardNote.textContent = cur.tab ? "" : "Nothing on the table changes on this screen.";
}

function render() {
  const ep = demo.episodes[st.ep];
  const s = ep.steps[st.step];
  const frag = document.createDocumentFragment();
  s.screen.forEach((spans, i) => {
    frag.appendChild(line(spans));
    if (i < s.screen.length - 1 || s.prompt.length) frag.appendChild(document.createTextNode("\n"));
  });
  if (s.prompt.length) {
    frag.appendChild(line(s.prompt));
    const typed = document.createElement("span");
    typed.className = "b typed";
    typed.textContent = s.keys.slice(0, st.typed);
    frag.appendChild(typed);
    const cur = document.createElement("span");
    cur.className = "cur";
    cur.textContent = "█";
    frag.appendChild(cur);
  }
  term.replaceChildren(frag);

  for (let i = st.step; i >= 0; i--) if (ep.steps[i].cap) { st.cap = ep.steps[i].cap; break; }
  if (capEl.textContent !== st.cap) {
    capEl.classList.remove("show");
    capEl.textContent = st.cap;
    requestAnimationFrame(() => capEl.classList.add("show"));
  }

  if (!s.prompt.length) keysEl.textContent = "";
  else if (!s.keys) keysEl.textContent = "you press: enter";
  else keysEl.textContent = "you type: " + s.keys + "  then enter";

  counter.textContent = `${st.step + 1} / ${ep.steps.length}`;
  prog.max = ep.steps.length - 1;
  prog.value = st.step;
  epTitle.textContent = ep.title;
  epBlurb.textContent = ep.blurb;
  $$("#chapters button").forEach((b, i) => b.classList.toggle("active", i === st.ep));
  playBtn.textContent = st.playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", st.playing ? "true" : "false");
  renderCards();
}

function clearTimer() { clearTimeout(st.timer); st.timer = 0; }

function goto(ep, step, typedAll) {
  st.ep = Math.max(0, Math.min(demo.episodes.length - 1, ep));
  st.step = Math.max(0, Math.min(demo.episodes[st.ep].steps.length - 1, step));
  const s = demo.episodes[st.ep].steps[st.step];
  st.typed = typedAll ? s.keys.length : 0;
  render();
  history.replaceState(null, "", `#${demo.episodes[st.ep].id}`);
}

function stepForward() {
  const ep = demo.episodes[st.ep];
  if (st.step < ep.steps.length - 1) return goto(st.ep, st.step + 1, false), true;
  if (st.ep < demo.episodes.length - 1) return goto(st.ep + 1, 0, false), true;
  return false;
}

function stepBack() {
  if (st.step > 0) return goto(st.ep, st.step - 1, true);
  if (st.ep > 0) return goto(st.ep - 1, demo.episodes[st.ep - 1].steps.length - 1, true);
}

/* The animation: show the screen, wait, type the keys one by one, wait, next. */
function tick() {
  if (!st.playing) return;
  const s = demo.episodes[st.ep].steps[st.step];
  const f = speedFactor();
  if (st.typed < s.keys.length) {
    st.typed++;
    render();
    st.timer = setTimeout(tick, PER_KEY(s) / f);
    return;
  }
  const settle = s.prompt.length ? (s.fast ? 180 : 800) : 0;
  st.timer = setTimeout(() => {
    if (!st.playing) return;
    if (!stepForward()) { st.playing = false; render(); return; }
    st.timer = setTimeout(tick, HOLD(demo.episodes[st.ep].steps[st.step]) / f);
  }, settle / f);
}

function play() {
  if (st.playing) return;
  st.playing = true;
  render();
  const s = demo.episodes[st.ep].steps[st.step];
  st.timer = setTimeout(tick, (st.typed ? 0 : HOLD(s)) / speedFactor());
}

function pause() { st.playing = false; clearTimer(); render(); }

playBtn.addEventListener("click", () => (st.playing ? pause() : play()));
prevBtn.addEventListener("click", () => { pause(); stepBack(); });
nextBtn.addEventListener("click", () => { pause(); stepForward(); st.typed = demo.episodes[st.ep].steps[st.step].keys.length; render(); });
prog.addEventListener("input", () => { const v = Number(prog.value); pause(); goto(st.ep, v, true); });  // read before pause() re-renders the slider
speedSel.addEventListener("change", () => { if (st.playing) { clearTimer(); st.timer = setTimeout(tick, 50); } });

addEventListener("keydown", (e) => {
  if (e.target.closest("input, select, textarea, button")) return;
  if (e.key === " ") { e.preventDefault(); st.playing ? pause() : play(); }
  else if (e.key === "ArrowRight") { pause(); stepForward(); st.typed = demo.episodes[st.ep].steps[st.step].keys.length; render(); }
  else if (e.key === "ArrowLeft") { pause(); stepBack(); }
});

/* chapters */
demo.episodes.forEach((ep, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<span class="n mono">${String(i + 1).padStart(2, "0")}</span><span class="t">${ep.title}</span><span class="c mono">${ep.steps.length} screens</span>`;
  b.addEventListener("click", () => { pause(); goto(i, 0, false); if (!reducedMotion) play(); });
  chapters.appendChild(b);
});

/* card tabs: the panel follows the screens; click a card to hold it, click it again to let go */
TABS.forEach(([id, label]) => {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.tab = id;
  b.textContent = label;
  b.addEventListener("click", () => {
    st.pinned = st.pinned === id ? null : id;
    tabsEl.classList.toggle("pinned", !!st.pinned);
    renderCards();
  });
  tabsEl.appendChild(b);
});

/* 80 columns always fit the box: the cell is 0.6 em wide in this font */
function fit() {
  const box = term.parentElement;   // .screen; min-width 0, so this is the room there really is
  const w = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
  const px = Math.max(8.5, Math.min(15.5, w / 80 / 0.6));
  term.style.fontSize = px + "px";
}
addEventListener("resize", fit);
fit();

/* start where the link points, or at the splash */
const want = demo.episodes.findIndex((e) => "#" + e.id === location.hash);
goto(want >= 0 ? want : 0, 0, reducedMotion);
if (!reducedMotion) {
  // start playing once the player is in view, not before
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { play(); io.disconnect(); }
  }, { threshold: 0.4 });
  io.observe(term);
}
