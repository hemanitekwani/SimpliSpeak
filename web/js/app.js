// SimpliSpeak app.
//
// Two ways to use it, chosen on the start screen (and switchable in Settings):
//  * Audio mode  - the whole screen is one gesture surface and the app speaks everything.
//                  Every screen is a spoken list: swipe right/left to hear options, double tap
//                  anywhere to choose. Nothing has to be found by sight.
//  * Screen reader mode - for TalkBack / VoiceOver users. Plain labelled buttons; the text is
//                  handed to the user's own screen reader (their voice, their speed) through a
//                  live region, so two voices never talk over each other.
import {
  settings, earcon, speak, stopSpeaking, loadVoices, ttsSupported,
  voiceSupported, listenOnce, startContinuous, stopListening, unlockSpeech, hooks,
} from "./audio.js";
import * as audio from "./audio.js";
import { attachGestures } from "./gestures.js";
import * as study from "./study.js";

export const LEVELS = [
  { key: "original", name: "Original", desc: "The exact words of the source" },
  { key: "light", name: "Light", desc: "Plain words, same sentences" },
  { key: "simple", name: "Simple", desc: "Short sentences" },
  { key: "very_simple", name: "Very simple", desc: "Very short, one idea each" },
];

const $ = id => document.getElementById(id);
const state = {
  screen: "start", doc: null, idx: 0, level: 2, playing: false, partDone: false,
  condition: "simplispeak",      // study condition; "baseline" = plain reading, no simplification controls
  explainCursor: -1, run: 0, menu: null, ai: false,
};
const audioMode = () => settings.mode === "audio";
const selfVoice = () => audioMode() || settings.appVoice;

// ---------------- Logging (feeds the study module) ----------------
const t0 = performance.now();
let logSink = null;
function log(event, data = {}) {
  const e = { t: Math.round(performance.now() - t0), event, idx: state.idx, level: LEVELS[state.level].key, ...data };
  if (logSink) logSink(e);
  if (location.hash === "#debug") console.log(e);
}

// ---------------- Output ----------------
function live(text, assertive = false) {
  const r = $(assertive ? "alert" : "live");
  r.textContent = "";
  setTimeout(() => { r.textContent = text; }, 60);
}
/** Say something to the user: app voice in audio mode, the user's screen reader otherwise. */
function say(text, { assertive = false } = {}) {
  if (selfVoice()) return speak(text);
  live(text, assertive);
  return Promise.resolve(true);
}

// ---------------- Settings ----------------
const STORE = "simplispeak.settings.v2";   // v2: older saved gesture-mode choices are dropped
function loadSettings() { try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch { /* blocked */ } }
function saveSettings() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* blocked */ } }
function applyDisplay() {
  const root = document.documentElement;
  root.classList.toggle("large", settings.large);
  root.classList.toggle("contrast", settings.contrast);
  document.body.classList.toggle("audio", audioMode());
  $("sr-switch").hidden = !audioMode();
  $("mode-chip").textContent = audioMode() ? "Gesture mode" : (settings.appVoice ? "Voice on" : "Screen reader");
}
function setMode(m) {
  settings.mode = m;
  saveSettings();
  applyDisplay();
  log("mode", { mode: m });
}

// ---------------- Screens and the gesture surface ----------------
let ctrl = null;   // current controller: { gesture(name), key(event) -> handled?, voice(result) }
const surface = $("surface");

function show(name, title) {
  if (state.screen === "scan" && name !== "scan") stopCamera();
  document.querySelectorAll(".screen").forEach(s => { s.hidden = s.id !== `s-${name}`; });
  const sec = $(`s-${name}`);
  const t = title || sec.dataset.title || "SimpliSpeak";
  $("screen-title").textContent = t;
  document.title = `${t} · SimpliSpeak`;
  state.screen = name;
  $("fab-voice").hidden = !(voiceSupported && !audioMode() && ["menu", "listen", "scan"].includes(name));
  window.scrollTo(0, 0);
  log("screen", { screen: name });
}

function setController(c, { surface: useSurface = true } = {}) {
  ctrl = c;
  const on = useSurface && audioMode();
  surface.hidden = !on;
  if (on) surface.focus({ preventScroll: true });
  if (settings.handsFree && voiceSupported && c?.voice) startContinuous(r => ctrl?.voice?.(r));
  else stopListening();
}

attachGestures(surface, g => {
  surface.classList.add("flash");
  setTimeout(() => surface.classList.remove("flash"), 160);
  if (g === "twoswipeup") return voiceCommand();
  ctrl?.gesture?.(g);
});

function showForm(name) {
  show(name);
  setController({ key: e => (e.key === "Escape" ? (goHome(), true) : false) }, { surface: false });
  const first = $(`s-${name}`).querySelector("input, select, textarea, button");
  first?.focus();
}

// ---------------- Spoken lists (menus) ----------------
const labelOf = it => (typeof it.label === "function" ? it.label() : it.label);

function openMenu(cfg) {
  const m = { index: 0, ...cfg };
  state.menu = m;
  show("menu", cfg.title);
  $("menu-title").textContent = cfg.title;
  $("menu-prompt").textContent = cfg.visiblePrompt ?? cfg.prompt ?? "";
  $("menu-hint").innerHTML = audioMode()
    ? "<span>swipe ⇆</span> hear options · <span>double tap</span> choose · <span>tap</span> repeat · <span>hold</span> help · <span>2-finger swipe down</span> back · <span>2-finger swipe up</span> voice"
    : "";
  renderMenu(m);
  $("menu-tip").hidden = audioMode() || !voiceSupported || !!cfg.noTip;
  setController(menuController);
  log("menu", { menu: cfg.name });

  if (audioMode()) {
    const intro = [cfg.prompt];
    if (settings.hintsHeard < 3 && !cfg.noHint) {
      intro.push("Swipe right or left to hear the options. Double tap anywhere to choose.");
      settings.hintsHeard++; saveSettings();
    }
    speak(intro.filter(Boolean).join(" ")).then(ok => { if (ok && state.menu === m) speakItem(m); });
  } else {
    if (cfg.prompt) live(cfg.prompt);
    const btn = $("menu-list").children[m.index]?.querySelector("button");
    btn?.focus({ preventScroll: true });
    if (settings.appVoice && cfg.prompt) speak(cfg.prompt);
  }
  return m;
}

function renderMenu(m) {
  const ul = $("menu-list");
  ul.innerHTML = "";
  m.items.forEach((it, i) => {
    const li = document.createElement("li");
    if (i === m.index) li.className = "current";
    if (it.adjust) {
      const box = document.createElement("div");
      box.className = "adjust";
      box.innerHTML = `<span class="label"><span>${labelOf(it)}</span><span class="value">${it.value()}</span></span>`;
      for (const [d, sym, word] of [[-1, "−", "Decrease"], [1, "+", "Increase"]]) {
        const b = document.createElement("button");
        b.textContent = sym;
        b.setAttribute("aria-label", `${word} ${labelOf(it)}, now ${it.value()}`);
        b.addEventListener("click", () => { m.index = i; menuAdjust(d, "button"); });
        box.append(b);
      }
      li.append(box);
    } else {
      const b = document.createElement("button");
      const detail = (!audioMode() && it.readerDetail) || it.detail;
      b.innerHTML = `<span class="row">${it.ico ? `<span class="ico" aria-hidden="true">${it.ico}</span>` : ""}` +
        `<span class="label"><span>${labelOf(it)}</span>${detail ? `<span class="detail">${detail}</span>` : ""}</span></span>`;
      b.addEventListener("click", () => menuChoose(i, "button"));
      li.append(b);
    }
    ul.append(li);
  });
}

function highlight(m) {
  [...$("menu-list").children].forEach((li, i) => li.classList.toggle("current", i === m.index));
  $("menu-list").children[m.index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function itemText(m, i) {
  const it = m.items[i];
  let t = labelOf(it);
  if (it.adjust) t += `: ${it.value()}. Swipe up or down to change`;
  if (it.detail) t += `. ${it.detail}`;
  return `${t}. ${i + 1} of ${m.items.length}.`;
}

function speakItem(m = state.menu) {
  highlight(m);
  const it = m.items[m.index];
  if (it.onFocus) return it.onFocus();
  return say(itemText(m, m.index));
}

function menuMove(d, modality) {
  const m = state.menu, to = m.index + d;
  if (to < 0 || to >= m.items.length) { earcon("limit"); return speakItem(m); }
  m.index = to;
  earcon("tick");
  log("menu_move", { menu: m.name, to, modality });
  m.onMove?.(to);
  speakItem(m);
}

function menuChoose(i, modality) {
  const m = state.menu;
  m.index = i;
  highlight(m);
  const it = m.items[i];
  log("menu_choose", { menu: m.name, item: labelOf(it), index: i, modality });
  if (it.adjust) return say(`${labelOf(it)}: ${it.value()}. Swipe up or down to change it.`);
  stopSpeaking();
  earcon("success");
  it.choose(modality);
}

function menuAdjust(d, modality) {
  const m = state.menu, it = m.items[m.index];
  if (!it.adjust) return;
  it.adjust(d);
  log("setting", { item: labelOf(it), value: it.value(), modality });
  renderMenu(m);
  say(`${labelOf(it)}: ${it.value()}`);
}

function menuHelp() {
  const m = state.menu;
  const how = audioMode()
    ? "Swipe right or left to move. Double tap anywhere to choose. Tap to hear the option again. Two-finger swipe down to go back. Two-finger swipe up for a voice command."
    : "Use your screen reader to move between the buttons.";
  return say(`${m.prompt || m.title}. ${how}`);
}

function menuBack() {
  const m = state.menu;
  if (m.onBack) { stopSpeaking(); return m.onBack(); }
  return say("This is the home menu.");
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const menuController = {
  gesture(g) {
    const m = state.menu, it = m.items[m.index];
    switch (g) {
      case "swiperight": return menuMove(1, "gesture");
      case "swipeleft": return menuMove(-1, "gesture");
      case "swipeup":
      case "swipedown": {
        const d = g === "swipeup" ? 1 : -1;
        if (it.adjust) return menuAdjust(d, "gesture");
        if (m.vertical) return menuMove(g === "swipeup" ? m.vertical.up : m.vertical.down, "gesture");
        return menuMove(-d, "gesture");
      }
      case "doubletap": return menuChoose(m.index, "gesture");
      case "tap": case "twofingertap": return speakItem(m);
      case "longpress": return menuHelp();
      case "twoswipedown": return menuBack();
    }
  },
  key(e) {
    const m = state.menu, it = m.items[m.index], k = e.key;
    const n = parseInt(k, 10);
    if (n >= 1 && n <= m.items.length && m.numbered) { menuChoose(n - 1, "keyboard"); return true; }
    if (k === "Escape" || k === "Backspace") { menuBack(); return true; }
    if (k.toLowerCase() === "v") { voiceCommand(); return true; }
    if (k.toLowerCase() === "h") { menuHelp(); return true; }
    if (k.toLowerCase() === "r") { speakItem(m); return true; }
    if (!audioMode()) return false;            // screen reader mode: native keyboard behaviour
    if (k === "ArrowRight") { menuMove(1, "keyboard"); return true; }
    if (k === "ArrowLeft") { menuMove(-1, "keyboard"); return true; }
    if (k === "ArrowDown" || k === "ArrowUp") {
      if (it.adjust) menuAdjust(k === "ArrowUp" ? 1 : -1, "keyboard");
      else if (m.vertical) menuMove(k === "ArrowUp" ? m.vertical.up : m.vertical.down, "keyboard");
      else menuMove(k === "ArrowDown" ? 1 : -1, "keyboard");
      return true;
    }
    if (k === "Enter" || k === " ") { menuChoose(m.index, "keyboard"); return true; }
    return false;
  },
  voice(r) {
    const m = state.menu;
    if (!r?.transcript) return voiceFailed(r);
    log("voice", { transcript: r.transcript, cmd: r.cmd });
    const t = r.transcript.toLowerCase();
    // 1. Option by number: "two", "option 3"
    const num = t.match(/\b(\d|one|two|three|four|five|six|seven|eight|nine)\b/);
    if (m.numbered && num) {
      const n = NUMBER_WORDS[num[1]] || parseInt(num[1], 10);
      if (n >= 1 && n <= m.items.length) return menuChoose(n - 1, "voice");
    }
    // 2. Option by its command word or its name: "yes", "paste", "scan", "samples"
    let best = -1, bestScore = 0;
    m.items.forEach((it, i) => {
      if (it.cmd && it.cmd === r.cmd) { best = i; bestScore = 99; return; }
      const words = labelOf(it).toLowerCase().match(/[a-z]{4,}/g) || [];
      const score = words.filter(w => t.includes(w)).length;
      if (score > bestScore) { best = i; bestScore = score; }
    });
    if (best >= 0) return menuChoose(best, "voice");
    // 3. General commands
    switch (r.cmd) {
      case "next": return menuMove(1, "voice");
      case "back": return menuBack();
      case "choose": case "yes": return menuChoose(m.index, "voice");
      case "repeat": return speakItem(m);
      case "help": return menuHelp();
      case "home": return goHome();
      case "simpler": return m.vertical ? menuMove(m.vertical.up, "voice") : voiceFailed(r);
      case "detail": return m.vertical ? menuMove(m.vertical.down, "voice") : voiceFailed(r);
    }
    return voiceFailed(r);
  },
};

// ---------------- Home ----------------
function goHome(prompt) {
  stopSpeaking();
  state.playing = false;
  state.run++;
  const items = [];
  if (state.doc && !study.active()) {
    items.push({ label: "Continue listening", detail: state.doc.title, ico: "▶", choose: () => resumeListening() });
  }
  items.push(
    { label: "Paste from clipboard", detail: "Copy text in any app first", ico: "📋", choose: () => pasteFromClipboard() },
    { label: "Scan paper", detail: "Use the camera; I guide you", ico: "📷", choose: () => openScan() },
    { label: "Samples", detail: "Medicine leaflet, bank letter, electricity bill", ico: "📄", choose: () => openSamples() },
    { label: "Type text", detail: "Needs a keyboard", ico: "⌨", choose: () => openType() },
    { label: "How to use", detail: "Gestures, voice commands, practice", ico: "❔", choose: () => openHelp() },
    { label: "Settings", detail: "Speed, voice, mode", ico: "⚙", choose: () => openSettings() },
  );
  if (!study.active()) items.push({ label: "Study mode", detail: "For the test facilitator", ico: "🧪", choose: () => study.showSetup() });
  openMenu({ name: "home", title: "Home", prompt: prompt || "Home menu.", visiblePrompt: "What would you like to listen to?", items });
}

// ---------------- Text intake ----------------
function wordCount(t) { return (t.match(/[\p{L}\p{N}'’-]+/gu) || []).length; }

async function pasteFromClipboard() {
  log("input", { route: "paste" });
  let text = "";
  try { text = await navigator.clipboard.readText(); } catch { text = ""; }
  if (!text.trim()) {
    earcon("error");
    return goHome("I could not find any text on the clipboard. Copy some text in another app, then choose Paste from clipboard again.");
  }
  earcon("success");
  await say(`Pasted ${wordCount(text)} words.`);
  processText(text, "paste");
}

async function processText(text, source, title) {
  const intercepted = await study.intercept(text, source);
  if (intercepted) return openDoc(intercepted);
  show("working");
  setController({ gesture: g => { if (g === "tap") say("Still simplifying. Please wait."); } });
  say("Simplifying. This takes a few seconds.");
  const ticker = setInterval(() => earcon("tick"), 900);
  try {
    const res = await fetch("/api/simplify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title: title || firstWords(text) }),
    });
    const doc = await res.json();
    if (!res.ok) throw new Error(doc.error || "Something went wrong.");
    doc.source = source;
    log("simplified", { engine: doc.engine, words: doc.words, parts: doc.sentences.length, flagged: doc.flagged });
    openDoc(doc);
  } catch (e) {
    earcon("error");
    goHome(`${e.message || "I could not reach the server."} Please try again.`);
  } finally {
    clearInterval(ticker);
  }
}
function firstWords(t) { return t.trim().split(/\s+/).slice(0, 6).join(" ") + "…"; }

async function loadSample(id) {
  const doc = await (await fetch(`/api/samples/${id}`)).json();
  doc.source = "sample";
  return doc;
}

async function openSamples() {
  let samples = [];
  try { samples = await (await fetch("/api/samples")).json(); } catch { return goHome("I could not load the samples. Is the server running?"); }
  openMenu({
    name: "samples", title: "Samples", prompt: "Samples.", onBack: () => goHome(),
    items: samples.map(s => ({
      label: s.title.replace(/^[^:]+:\s*/, ""), detail: s.kind,
      choose: async () => { log("input", { route: "sample", sample: s.id }); openDoc(await loadSample(s.id)); },
    })),
  });
}

function openType() {
  showForm("type");
  say("Type or paste your text in the box, then press Simplify and listen.");
}

// ---------------- Level chooser ----------------
function openDoc(doc) {
  Object.assign(state, { doc, idx: 0, playing: false, partDone: false, explainCursor: -1 });
  if (state.condition === "baseline") { state.level = 0; return startListening(); }
  state.level = Number(settings.startLevel);
  const first = doc.sentences[0];
  const parts = `${doc.sentences.length} part${doc.sentences.length === 1 ? "" : "s"}`;
  openMenu({
    name: "level", title: "Choose a level", index: state.level, numbered: true,
    vertical: { up: 1, down: -1 },                    // swipe up = simpler, as when listening
    prompt: `${doc.title}. ${parts}. ${doc.notice ? doc.notice + " " : ""}How simple should it be? ` +
      (audioMode() ? "Swipe to hear each level read aloud. Double tap to start." : "Each level shows a preview."),
    visiblePrompt: `${doc.title} · ${parts} · ${doc.words} words${doc.notice ? ` · ${doc.notice}` : ""}`,
    onMove: i => { state.level = i; },
    onBack: () => goHome(),
    items: LEVELS.map((lv, i) => ({
      label: lv.name, detail: lv.desc,
      readerDetail: `${lv.desc}. Preview: ${first[lv.key]}`,
      onFocus: () => say(`${lv.name}. ${first[lv.key]}  ${i + 1} of 4.`),
      choose: () => { state.level = i; startListening(); },
    })),
  });
}

// ---------------- Listening ----------------
const cur = () => state.doc.sentences[state.idx];
const levelKey = () => LEVELS[state.level].key;

function startListening() {
  log("listen_start", { condition: state.condition });
  show("listen", state.doc.title);
  const baseline = state.condition === "baseline";
  $("l-controls").hidden = audioMode();
  document.querySelectorAll("#l-controls [data-feature]").forEach(b => { b.hidden = baseline; });
  $("c-play").hidden = !settings.appVoice;
  $("c-play").classList.toggle("primary", !!settings.appVoice);
  $("c-next").classList.toggle("primary", !settings.appVoice);
  $("l-voicetip").hidden = audioMode() || !voiceSupported;
  setController(listenController);
  if (!audioMode() && !settings.appVoice) $("c-next").focus({ preventScroll: true });
  state.playing = selfVoice();
  playPart();
}

function resumeListening() {
  show("listen", state.doc.title);
  setController(listenController);
  if (!audioMode()) $("c-next").focus({ preventScroll: true });
  say(`Back to part ${state.idx + 1}.`).then(() => { state.playing = selfVoice(); playPart(); });
}

function escapeHtml(t) { return t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function termRegex(term) { return new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i"); }

function render() {
  const n = state.doc.sentences.length, s = cur(), key = levelKey();
  $("l-pos").textContent = `Part ${state.idx + 1} of ${n}`;
  $("l-level").textContent = LEVELS[state.level].name;
  $("l-bar").style.width = `${Math.round(((state.idx + 1) / n) * 100)}%`;
  let html = escapeHtml(key === "original" ? s.original : s[key]);
  if (state.condition !== "baseline") {
    for (const term of Object.keys(state.doc.glossary || {}).sort((a, b) => b.length - a.length)) {
      html = html.replace(termRegex(escapeHtml(term)), m => `<mark>${m}</mark>`);
    }
  }
  const p = $("l-text");
  p.innerHTML = settings.showText ? html : "Text hidden. Listening only.";
  p.classList.toggle("dim", !settings.showText);
  const unsure = s.unsure?.[key];
  $("l-unsure").hidden = !unsure;
  if (unsure) $("l-unsure").textContent = `This level may have lost: ${unsure.join(", ")}. You hear the original instead.`;
  $("c-play").textContent = state.playing ? "Pause" : "Play all";
  $("c-simpler").disabled = state.level === 3;
  $("c-detail").disabled = state.level === 0;
  $("c-next").textContent = state.idx >= n - 1 ? "Finish" : "Next part";
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function playPart({ auto } = {}) {
  const run = ++state.run;
  const keepGoing = auto ?? state.playing;
  const s = cur(), key = levelKey();
  state.partDone = false;
  state.explainCursor = -1;
  render();
  renderWords();
  log("part_start");
  earcon("part");
  const unsure = s.unsure?.[key];
  if (unsure) { earcon("unsure"); log("unsure_shown", { missing: unsure }); }
  const text = unsure
    ? `Careful: the simpler version may have lost a detail. Here is the original. ${s.original}`
    : (key === "original" ? s.original : s[key]);

  if (!selfVoice()) {                       // the user's screen reader reads it; they move on with Next
    live(text, true);
    state.partDone = true; state.playing = false;
    log("part_end");
    return render();
  }
  const ok = await speak(text);
  if (!ok || run !== state.run) return;
  state.partDone = true;
  log("part_end");
  if (!keepGoing || !state.playing || settings.pauseEach) { state.playing = false; return render(); }
  await sleep(350);
  if (run !== state.run || !state.playing) return;
  if (state.idx < state.doc.sentences.length - 1) { state.idx++; playPart(); }
  else finishDoc();
}

function finishDoc() {
  state.playing = false;
  state.run++;
  log("doc_end");
  earcon("end");
  const baseline = state.condition === "baseline";
  openMenu({
    name: "feedback", title: "Was it clear?", noHint: true,
    prompt: "End of the text. Was it clear? " + (audioMode() ? "Swipe to hear yes or no, then double tap. Or say yes or no." : ""),
    onBack: () => { show("listen", state.doc.title); setController(listenController); playPart({ auto: false }); },
    items: [
      { label: "Yes, clear", cmd: "yes", ico: "✓", choose: () => feedback(true) },
      { label: "No, not clear", cmd: "no", ico: "↻", detail: baseline ? "Start again from the beginning" : "Start again, one level simpler", choose: () => feedback(false) },
    ],
  });
}

async function feedback(clear) {
  log("feedback", { clear });
  if (clear) {
    if (study.active()) return study.afterListen();
    return openMenu({
      name: "done", title: "Finished", prompt: `Well done. You finished at level ${LEVELS[state.level].name}.`, noHint: true,
      onBack: () => goHome(),
      items: [
        { label: "Listen again", ico: "↻", choose: () => { state.idx = 0; startListening(); } },
        { label: "Choose another level", ico: "⇅", choose: () => openDoc(state.doc) },
        { label: "Home", ico: "⌂", choose: () => goHome() },
      ],
    });
  }
  state.idx = 0;
  let msg;
  if (state.condition === "baseline") msg = "Starting again from the beginning.";
  else if (state.level < 3) { state.level++; earcon("simpler"); msg = `Starting again, one level simpler: ${LEVELS[state.level].name}.`; }
  else msg = "This is already the simplest level. Starting again. Ask me to explain any hard word.";
  log("restart", { reason: "not_clear" });
  show("listen", state.doc.title);
  setController(listenController);
  if (!audioMode()) $("c-next").focus({ preventScroll: true });
  await say(msg);
  state.playing = selfVoice();
  playPart();
}

// ---------------- Listen actions (one dispatcher for every modality) ----------------
const BASELINE_BLOCKED = new Set(["simpler", "detail", "original", "explain"]);
const resumeIfPlaying = () => { if (state.playing && state.screen === "listen") playPart(); };

async function act(name, modality = "button", arg = "") {
  if (state.screen !== "listen" || !state.doc) return;
  if (state.condition === "baseline" && BASELINE_BLOCKED.has(name)) {
    earcon("limit");
    log("blocked", { action: name, modality });
    return say("That is not available in this version.");
  }
  if (name === "toggle") name = state.playing ? "pause" : "play";
  log("action", { action: name, modality, arg: arg || undefined });
  const n = state.doc.sentences.length;
  switch (name) {
    case "play":
      if (state.playing && selfVoice()) return;
      state.playing = selfVoice();
      if (state.partDone && state.idx < n - 1) state.idx++;
      else if (state.partDone && state.idx === n - 1) return finishDoc();
      return playPart();
    case "pause":
      state.playing = false; state.run++; stopSpeaking(); render();
      return say("Paused.");
    case "next":
      if (state.idx >= n - 1) return finishDoc();
      state.idx++; return playPart();
    case "back":
      if (state.idx <= 0) { earcon("limit"); log("limit", { action: name }); return say("This is the first part.").then(resumeIfPlaying); }
      state.idx--; return playPart();
    case "repeat": return playPart();
    case "simpler":
    case "detail": {
      const to = state.level + (name === "simpler" ? 1 : -1);
      if (to < 0 || to > 3) {
        earcon("limit"); log("limit", { action: name });
        return say(to > 3 ? "This is already the simplest level." : "This is already the original wording.").then(resumeIfPlaying);
      }
      state.level = to;
      earcon(name);
      state.run++;
      await say(LEVELS[to].name);
      return playPart();
    }
    case "original": {
      const run = ++state.run;
      earcon("original");
      const ok = await say(`Original wording. ${cur().original}`, { assertive: true });
      if (ok && run === state.run && state.playing && selfVoice()) { state.partDone = true; state.playing = false; act("play", "auto"); }
      return;
    }
    case "explain": return arg ? explainWord(arg) : explainNext();
    case "faster":
    case "slower":
      settings.rate = Math.round(Math.max(0.6, Math.min(1.8, settings.rate + (name === "faster" ? 0.1 : -0.1))) * 10) / 10;
      saveSettings(); state.run++;
      await say(`Speed ${settings.rate.toFixed(1)}`);
      return resumeIfPlaying();
    case "where":
      state.run++;
      await say(`Part ${state.idx + 1} of ${n}. Level ${LEVELS[state.level].name}. ${state.playing ? "Playing" : "Paused"}.`);
      return resumeIfPlaying();
    case "help": state.run++; await listenHelp(); return resumeIfPlaying();
    case "home": return goHome("Paused. Home menu. Choose Continue listening to go back to your place.");
    case "done": return finishDoc();
  }
}

function listenHelp() {
  const baseline = state.condition === "baseline";
  if (audioMode()) {
    return speak("Double tap to play or pause. Swipe right for the next part, left to go back. Tap once to repeat." +
      (baseline ? "" : " Swipe up for simpler, down for more detail. Hold your finger down to explain a hard word. Two-finger tap for the original wording.") +
      " Two-finger swipe up for a voice command. Two-finger swipe down for the menu.");
  }
  return say("Use Next part to move on, Repeat to hear it again, and Previous part to go back." +
    (baseline ? "" : " Simpler and More detail change the wording but keep your place. Explain a word gives help with hard words. Original wording reads the exact text."));
}

const GESTURES = {
  doubletap: "toggle", swiperight: "next", swipeleft: "back", swipeup: "simpler", swipedown: "detail",
  tap: "repeat", longpress: "explain", twofingertap: "original", twoswipedown: "home",
};
const KEYMAP = {
  " ": "toggle", ArrowRight: "next", ArrowLeft: "back", ArrowUp: "simpler", ArrowDown: "detail",
  e: "explain", r: "repeat", o: "original", w: "where", h: "help", "+": "faster", "=": "faster", "-": "slower", Escape: "home",
};
const listenController = {
  gesture(g) { if (GESTURES[g]) act(GESTURES[g], "gesture"); },
  key(e) {
    if (!audioMode() && (e.key === " " || e.key === "Enter")) return false;   // let the focused button work
    if (e.key.toLowerCase() === "v") { voiceCommand(); return true; }
    const a = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
    if (!a) return false;
    act(a, "keyboard");
    return true;
  },
  voice(r) {
    if (!r?.cmd) return voiceFailed(r);
    log("voice", { transcript: r.transcript, cmd: r.cmd });
    const map = { yes: "play", no: "pause", choose: "play" };
    act(map[r.cmd] || r.cmd, "voice", r.arg);
  },
};

// ---------------- Word help ----------------
function termsInPart() {
  const s = cur(), key = levelKey(), g = state.doc.glossary || {};
  const hay = `${s.original} ${key === "original" ? "" : s[key]}`;
  const pos = t => s.original.toLowerCase().indexOf(t.toLowerCase());
  return Object.keys(g).filter(t => termRegex(t).test(hay)).sort((a, b) => pos(a) - pos(b));
}

function renderWords() {
  const box = $("l-words");
  if (state.condition === "baseline" || state.explainCursor < 0) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = "<dl>" + termsInPart().map((t, i) =>
    `<dt class="${i === state.explainCursor ? "current" : ""}">${escapeHtml(t)}</dt><dd>${escapeHtml(state.doc.glossary[t])}</dd>`).join("") + "</dl>";
}

async function explainNext() {
  const terms = termsInPart();
  const wasPlaying = state.playing;
  const run = ++state.run;
  earcon("explain");
  if (!terms.length) {
    log("explain", { term: null });
    await say("No hard words in this part. You can ask about any word with a voice command: what does, then the word, mean.");
  } else {
    state.explainCursor = (state.explainCursor + 1) % terms.length;
    const term = terms[state.explainCursor];
    renderWords();
    log("explain", { term, source: "glossary" });
    const more = state.explainCursor < terms.length - 1 ? " Explain again for the next word." : "";
    await say(`${term}: ${state.doc.glossary[term]}${more}`, { assertive: true });
  }
  if (run === state.run && wasPlaying && selfVoice()) playPart();
}

async function explainWord(word) {
  word = word.trim();
  if (!word) return explainNext();
  const run = ++state.run;
  const wasPlaying = state.playing;
  stopSpeaking();
  earcon("explain");
  const g = state.doc.glossary || {};
  const lw = word.toLowerCase();
  const key = Object.keys(g).find(t => t.toLowerCase() === lw)
    || Object.keys(g).find(t => t.toLowerCase().includes(lw) || lw.includes(t.toLowerCase()));
  let text, source = "glossary";
  if (key) text = `${key}: ${g[key]}`;
  else {
    try {
      const res = await (await fetch("/api/explain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: word, context: cur().original }),
      })).json();
      source = res.source;
      if (res.explanation) { text = `${word}: ${res.explanation}`; g[word] = res.explanation; }
    } catch { /* fall through */ }
    if (!text) { text = `Sorry, I do not have an explanation for ${word}.`; source = "none"; }
  }
  log("explain", { term: word, source });
  if (run !== state.run) return;
  await say(text, { assertive: true });
  if (run === state.run && wasPlaying && selfVoice()) playPart();
}

// ---------------- Voice commands ----------------
async function voiceCommand() {
  if (!voiceSupported) {
    earcon("error");
    return say("Voice commands need Chrome, Edge or Safari. Use gestures or buttons instead.");
  }
  const wasPlaying = state.playing;
  state.run++;
  stopSpeaking();
  $("c-voice").textContent = "Listening…";
  $("fab-voice").classList.add("on");
  toast("🎤 Listening… say a command");
  earcon("listen");
  const r = await listenOnce();
  $("c-voice").textContent = "Voice command";
  $("fab-voice").classList.remove("on");
  toast(r?.transcript ? `Heard: “${r.transcript}”` : "", 2500);
  earcon("heard");
  if (state.screen === "listen") state.playing = wasPlaying && !(r?.cmd === "play");
  if (ctrl?.voice) ctrl.voice(r);
  else voiceFailed(r);
  if (settings.handsFree && ctrl?.voice) startContinuous(x => ctrl?.voice?.(x));
}

function voiceFailed(r) {
  log("voice_fail", { transcript: r?.transcript || "" });
  earcon("error");
  const resume = state.screen === "listen" && state.playing;
  const why = audio.lastVoiceError;
  const msg = why === "not-allowed" || why === "service-not-allowed"
    ? "The microphone is blocked. Allow the microphone for this page in your browser settings, then try again."
    : why === "network" ? "Voice commands need an internet connection."
    : why === "no-speech" || !r?.transcript ? "I did not hear anything. Tap the microphone, then speak."
    : `I heard ${r.transcript}, but that is not a command. Try: next, back, repeat, simpler, more detail, or original.`;
  toast(msg, 4000);
  return say(msg).then(() => { if (resume) playPart(); });
}

// ---------------- Scan (camera, guidance, auto-capture, OCR) ----------------
let stream = null, guideTimer = null, lastGuide = "", lastGuideAt = 0, steadyCount = 0, ocrBusy = false, prevFrame = null;

function openScan() {
  show("scan");
  ocrBusy = false; steadyCount = 0;
  setController({
    gesture(g) {
      if (g === "doubletap") capture("gesture");
      else if (g === "tap") say(lastGuide || "Point the camera at the page.");
      else if (g === "twoswipedown") goHome();
      else if (g === "longpress") say("Hold the phone flat, about 30 centimetres above the page. I capture by myself when it is steady. Double tap to capture now. Two-finger swipe down to go back.");
    },
    key(e) {
      if (e.key === "Enter" && audioMode()) { capture("keyboard"); return true; }
      if (e.key === "Escape") { goHome(); return true; }
      return false;
    },
    voice(r) {
      if (/capture|take|photo|now|scan/.test(r?.transcript || "")) return capture("voice");
      if (r?.cmd === "home" || r?.cmd === "back") return goHome();
      voiceFailed(r);
    },
  });
  say("Scan paper. Hold the phone flat, about 30 centimetres above the page. I capture by myself when it is steady, or tap Capture now.");
  startCamera();                                  // do not wait for the speech to finish
}

async function startCamera() {
  if (state.screen !== "scan") return;
  if (!navigator.mediaDevices?.getUserMedia) return setGuide("The camera needs a secure https link. Choose a photo instead.", true);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false });
    const v = $("scan-video");
    v.srcObject = stream;
    await v.play();
    clearInterval(guideTimer);
    guideTimer = setInterval(checkFrame, 1000);
  } catch {
    setGuide("I cannot use the camera. Allow camera access, or choose a photo.", true);
  }
}
function stopCamera() {
  clearInterval(guideTimer);
  stream?.getTracks().forEach(t => t.stop());
  stream = null; prevFrame = null;
}
function setGuide(msg, force = false) {
  $("scan-guide").textContent = msg;
  const now = Date.now();
  if (force || (msg !== lastGuide && now - lastGuideAt > 3000)) { say(msg, { assertive: true }); lastGuideAt = now; }
  lastGuide = msg;
}
function checkFrame() {
  const v = $("scan-video");
  if (!v.videoWidth || ocrBusy) return;
  const c = document.createElement("canvas"); c.width = 64; c.height = 48;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(v, 0, 0, 64, 48);
  const d = g.getImageData(0, 0, 64, 48).data;
  const gray = new Float32Array(64 * 48);
  let sum = 0, diff = 0, edges = 0;
  for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    if (prevFrame) diff += Math.abs(gray[i] - prevFrame[i]);
    if (i % 64 < 63) edges += Math.abs(gray[i] - gray[i + 1]);
  }
  const bright = sum / gray.length, motion = prevFrame ? diff / gray.length : 99, detail = edges / gray.length;
  prevFrame = gray;
  let ok = false;
  if (bright < 60) setGuide("Too dark. Find more light.");
  else if (motion > 14) setGuide("Hold still.");
  else if (detail < 6) setGuide("I cannot see text. Move the phone slowly over the page.");
  else { ok = true; setGuide("Good. Keep still."); }
  steadyCount = ok ? steadyCount + 1 : 0;
  if (steadyCount >= 3) { steadyCount = 0; capture("auto"); }
}

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  tesseractLoading ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = res; s.onerror = () => { tesseractLoading = null; rej(new Error("I could not load the text reader. Check the internet connection.")); };
    document.head.append(s);
  });
  return tesseractLoading;
}

function capture(modality) {
  if (ocrBusy) return;
  const v = $("scan-video");
  if (!v.videoWidth) { $("scan-file").click(); return; }
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  log("capture", { modality });
  earcon("success");
  runOCR(c);
}

async function toJpegBase64(source) {
  let bmp = source;
  if (source instanceof Blob) {
    try { bmp = await createImageBitmap(source); }
    catch {
      bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(source); });
    }
  }
  const w = bmp.width || bmp.videoWidth, h = bmp.height || bmp.videoHeight;
  const k = Math.min(1, 1800 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}

async function readWithAI(source) {
  try {
    const image = await toJpegBase64(source);
    const res = await fetch("/api/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, mime: "image/jpeg" }) });
    if (!res.ok) return null;                     // AI unavailable: use the in-browser reader
    return ((await res.json()).text || "").trim();
  } catch { return null; }
}

async function runOCR(source) {
  ocrBusy = true;
  log("input", { route: "scan" });
  stopCamera();
  setGuide("Got it. Reading the page. This takes a few seconds.", true);
  const ticker = setInterval(() => earcon("tick"), 900);
  try {
    let text = state.ai ? await readWithAI(source) : null;
    let confidence = 100;
    if (text === null) {                          // no AI, or it failed: read in the browser
      await loadTesseract();
      const { data } = await window.Tesseract.recognize(source, "eng");
      text = data.text.replace(/\n(?!\n)/g, " ").trim();
      confidence = Math.round(data.confidence);
    }
    const n = wordCount(text);
    log("ocr", { words: n, confidence });
    if (n < 4) {
      earcon("error");
      ocrBusy = false;
      setGuide(`I could only read ${n} word${n === 1 ? "" : "s"}. Try again with more light, and hold the phone a little higher.`, true);
      return startCamera();
    }
    earcon("success");
    await say(`I read ${n} words.`);
    processText(text, "scan");
  } catch (e) {
    earcon("error");
    ocrBusy = false;
    setGuide(e.message || "Reading failed. Please try again.", true);
    startCamera();
  } finally {
    clearInterval(ticker);
  }
}

// ---------------- Settings ----------------
const onOff = v => (v ? "on" : "off");
function toggle(key, label, detail) {
  return {
    label: () => `${label}: ${onOff(settings[key])}`, detail,
    choose: () => { settings[key] = !settings[key]; saveSettings(); applyDisplay(); renderMenu(state.menu); say(`${label}: ${onOff(settings[key])}`); },
  };
}

function openSettings(index = 0) {
  const voices = loadVoices();
  const items = [
    { label: "Speech speed", adjust: d => { settings.rate = Math.round(Math.max(0.6, Math.min(1.8, settings.rate + d * 0.1)) * 10) / 10; saveSettings(); },
      value: () => `${settings.rate.toFixed(1)} times` },
    { label: "Starting level", adjust: d => { settings.startLevel = (Number(settings.startLevel) + d + 4) % 4; saveSettings(); },
      value: () => LEVELS[settings.startLevel].name },
  ];
  if (voices.length > 1) {
    items.push({ label: "Voice", value: () => (voices.find(v => v.voiceURI === settings.voiceURI)?.name || "Automatic"),
      adjust: d => {
        const i = voices.findIndex(v => v.voiceURI === settings.voiceURI);
        const j = (i + d + voices.length + 1) % (voices.length + 1) - 1;   // -1 = automatic
        settings.voiceURI = j < 0 ? "" : voices[j].voiceURI; saveSettings();
      } });
  }
  items.push(
    toggle("pauseEach", "Pause after each part"),
    toggle("earcons", "Sound cues"),
    toggle("handsFree", "Hands-free voice", "Always listening for commands. Use headphones."),
  );
  if (!audioMode()) items.push(toggle("appVoice", "Read text with the app voice", "Off: your screen reader reads the text"));
  items.push(
    toggle("showText", "Show text on screen"),
    toggle("large", "Extra large text"),
    toggle("contrast", "High contrast"),
    { label: audioMode() ? "Switch to normal mode (buttons)" : "Switch to gesture mode",
      detail: audioMode() ? "Buttons you can tap, with the app voice" : "No-look use: swipe and double tap anywhere on the screen",
      choose: () => { if (audioMode()) settings.appVoice = true; setMode(audioMode() ? "reader" : "audio"); goHome(modeWelcome()); } },
    { label: "Test the voice", choose: () => speak("Stop the medicine. Call a doctor now if you cannot breathe.") },
  );
  openMenu({ name: "settings", title: "Settings", prompt: "Settings.", items, index, onBack: () => goHome() });
}

// ---------------- Help and gesture practice ----------------
function openHelp() {
  const items = audioMode() ? [
    { label: "Practice the gestures", detail: "Try any gesture and I will tell you what it does", ico: "✋", choose: () => openPractice() },
    { label: "In menus", detail: "Swipe right or left to move. Double tap anywhere to choose. Tap to hear it again.", choose: () => speakItem() },
    { label: "Listening", detail: "Double tap to play or pause. Swipe right for next part, left for back. Tap to repeat.", choose: () => speakItem() },
    { label: "Changing the wording", detail: "Swipe up for simpler, down for more detail. You stay on the same part.", choose: () => speakItem() },
    { label: "Hard words", detail: "Hold your finger on the screen to explain a hard word. Two-finger tap for the original wording.", choose: () => speakItem() },
    { label: "Voice", detail: "Two-finger swipe up, then say a command: simpler, next, repeat, explain, or what does a word mean.", choose: () => speakItem() },
    { label: "Going back", detail: "Two-finger swipe down goes back, or to the menu.", choose: () => speakItem() },
  ] : [
    { label: "Moving through the text", detail: "Next part, Previous part and Repeat buttons. Your screen reader reads each part.", choose: () => speakItem() },
    { label: "Changing the wording", detail: "Simpler and More detail re-read the same part in new words.", choose: () => speakItem() },
    { label: "Hard words", detail: "Explain a word reads the hard words in this part, one per press. Original wording reads the exact text.", choose: () => speakItem() },
    { label: "Keyboard", detail: "Arrows: next, back, simpler, more detail. E explain, R repeat, O original, V voice, Escape menu.", choose: () => speakItem() },
    { label: "Voice", detail: "Voice command button, then say: simpler, next, repeat, or what does a word mean.", choose: () => speakItem() },
  ];
  openMenu({ name: "help", title: "How to use", prompt: "How to use.", items, onBack: () => goHome() });
}

const PRACTICE = {
  tap: "Tap. Repeats the part, or the option.",
  doubletap: "Double tap. Play or pause, or choose an option.",
  swiperight: "Swipe right. Next part, or next option.",
  swipeleft: "Swipe left. Previous part, or previous option.",
  swipeup: "Swipe up. Simpler.",
  swipedown: "Swipe down. More detail.",
  longpress: "Hold. Explains a hard word.",
  twofingertap: "Two-finger tap. Original wording.",
  twoswipeleft: "Two-finger swipe left. Not used.",
  twoswiperight: "Two-finger swipe right. Not used.",
};
function openPractice() {
  openMenu({ name: "practice", title: "Gesture practice", prompt: "Gesture practice. Try any gesture anywhere on the screen, and I will tell you what it does. Two-finger swipe down to finish.",
    noHint: true, items: [{ label: "Try a gesture anywhere", choose: () => {} }], onBack: () => openHelp() });
  setController({
    gesture(g) {
      log("practice", { gesture: g });
      if (g === "twoswipedown") return say("Two-finger swipe down. Back. Leaving practice.").then(() => openHelp());
      say(PRACTICE[g] || g);
    },
    key: e => (e.key === "Escape" ? (openHelp(), true) : false),
    voice: r => say(r?.transcript ? `I heard: ${r.transcript}. ${r.cmd ? `That means ${r.cmd}.` : "That is not a command."}` : "I did not hear anything."),
  });
}

// ---------------- Start ----------------
function modeWelcome() {
  if (audioMode()) return "Gesture mode. I talk, and you swipe and double tap anywhere on the screen. Home menu.";
  return settings.appVoice
    ? "Tap a button to choose. Tap the microphone to speak a command. Home menu."
    : "Screen reader mode. Your screen reader reads the text. Home menu.";
}

function begin(withMyVoice) {
  unlockSpeech();                                   // must happen inside the tap, before anything else
  document.body.classList.remove("starting");
  const firstTime = !settings.mode;
  if (withMyVoice) {                                // the normal start: buttons plus the app's own voice
    if (settings.mode !== "audio") { settings.appVoice = true; setMode("reader"); } else applyDisplay();
  } else { settings.appVoice = false; setMode("reader"); }   // TalkBack / VoiceOver user
  earcon("tick");
  const welcome = (firstTime ? "Welcome to SimpliSpeak. I read hard letters and leaflets in simple words, and you choose how simple. " : "") + modeWelcome();
  goHome(welcome);
}
$("btn-start").addEventListener("click", () => begin(true));
$("btn-start-sr").addEventListener("click", () => begin(false));
$("sr-switch").addEventListener("click", () => { settings.appVoice = false; setMode("reader"); goHome(modeWelcome()); });
document.addEventListener("pointerdown", unlockSpeech, { once: true, capture: true });

// ---------------- Voice button, toast and "no sound" banner ----------------
let toastTimer = null;
function toast(text, ms = 0) {
  const t = $("toast");
  clearTimeout(toastTimer);
  t.textContent = text;
  t.hidden = !text;
  if (text && ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
$("fab-voice").addEventListener("click", () => voiceCommand());
hooks.onSpeechProblem = () => { if (selfVoice()) $("voice-banner").hidden = false; };
hooks.onSpeechStart = () => { $("voice-banner").hidden = true; };
$("voice-banner").addEventListener("click", () => {
  unlockSpeech();
  $("voice-banner").hidden = true;
  speak("Voice is on.").then(() => {
    if (state.screen === "listen") playPart();
    else if (state.screen === "menu") speakItem(state.menu);
  });
});

// ---------------- Keyboard ----------------
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey || state.screen === "start") return;
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    if (e.key === "Escape") e.target.blur();
    return;
  }
  if (ctrl?.key?.(e)) e.preventDefault();
});

// ---------------- Wiring ----------------
function wire() {
  $("btn-home").addEventListener("click", () => (state.screen === "listen" ? act("home", "button") : goHome()));
  $("mode-chip").addEventListener("click", () => openSettings());

  $("type-text").addEventListener("input", e => { $("type-count").textContent = `${wordCount(e.target.value)} words`; });
  $("btn-type-go").addEventListener("click", () => {
    const t = $("type-text").value;
    if (!t.trim()) { earcon("error"); return say("The box is empty. Type or paste some text first.", { assertive: true }); }
    log("input", { route: "type" });
    processText(t, "type");
  });
  $("btn-type-back").addEventListener("click", () => goHome());

  $("btn-capture").addEventListener("click", () => capture("button"));
  $("scan-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) runOCR(f); e.target.value = ""; });

  const buttons = { "c-next": "next", "c-repeat": "repeat", "c-back": "back", "c-play": "toggle", "c-simpler": "simpler",
    "c-detail": "detail", "c-explain": "explain", "c-original": "original", "c-done": "done" };
  for (const [id, a] of Object.entries(buttons)) $(id).addEventListener("click", () => act(a, "button"));
  $("c-voice").addEventListener("click", () => voiceCommand());
}

async function checkStatus() {
  try {
    const s = await (await fetch("/api/status")).json();
    state.ai = s.ai;
    state.engine = s.ai ? `AI: ${s.model}` : "Offline simplification";
  } catch { state.engine = "Server not reachable"; }
  if (!ttsSupported) state.engine += " · this browser cannot speak";
  $("start-status").textContent = state.engine;
}

// API for the study module
export const app = {
  openMenu, showForm, goHome, say, speak, earcon, log, loadSample, openDoc, state, LEVELS, settings,
  setMode: m => { if (m === "reader") settings.appVoice = false; setMode(m); },
  setLogSink: fn => { logSink = fn; },
  setCondition: c => { state.condition = c; },
};

loadSettings();
applyDisplay();
wire();
study.init(app);
checkStatus();
$("btn-start").focus();
