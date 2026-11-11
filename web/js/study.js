// Study mode: runs a counterbalanced within-subjects session and records everything.
//
// Conditions
//   baseline     - "Version A": the text is read exactly as written (like a screen reader);
//                  next / back / repeat only
//   simplispeak  - "Version B": the full prototype
// Plan for participant number n (group g = n mod 4)
//   Task 0    practice text, SimpliSpeak, opened directly (learn the controls; not analysed)
//   Task 1-2  leaflet and bank letter via clipboard paste; text order and condition order counterbalanced
//   Task 3    electricity bill, SimpliSpeak, by scanning a printed copy (input-route comparison)
// Every question and rating is a spoken list, so participants answer with the same gestures,
// voice or screen reader they used for listening.

const $ = id => document.getElementById(id);
let app = null;
let session = null;
let taskIdx = -1;
let task = null;
let step = null;     // "brief" | "await_input" | "listening" | "questions" | "ratings" | "notes"

const SUS_ITEMS = [
  "I think that I would like to use SimpliSpeak frequently.",
  "I found SimpliSpeak unnecessarily complex.",
  "I thought SimpliSpeak was easy to use.",
  "I think that I would need the support of a technical person to be able to use SimpliSpeak.",
  "I found the various functions in SimpliSpeak were well integrated.",
  "I thought there was too much inconsistency in SimpliSpeak.",
  "I would imagine that most people would learn to use SimpliSpeak very quickly.",
  "I found SimpliSpeak very cumbersome to use.",
  "I felt very confident using SimpliSpeak.",
  "I needed to learn a lot of things before I could get going with SimpliSpeak.",
];
const TLX_ITEMS = [
  { key: "mental", text: "How mentally demanding was this task?", low: "very low", high: "very high" },
  { key: "physical", text: "How physically demanding was this task?", low: "very low", high: "very high" },
  { key: "temporal", text: "How hurried or rushed was the pace?", low: "very low", high: "very high" },
  { key: "performance", text: "How successful were you in understanding the text?", low: "perfect", high: "failure" },
  { key: "effort", text: "How hard did you have to work to understand it?", low: "very low", high: "very high" },
  { key: "frustration", text: "How insecure, discouraged, irritated or stressed were you?", low: "very low", high: "very high" },
];
const POST_RATINGS = [
  { key: "trust", text: "I trusted that the simplified text kept the important facts." },
  { key: "control", text: "I felt in control of how simple the text was." },
];
const POST_CHOICES = [
  { key: "input_pref", q: "Which way of bringing in text did you prefer?", options: ["Paste from clipboard", "Scan paper", "No preference"] },
  { key: "level_pref", q: "Which level did you find most useful?", options: ["Original", "Light", "Simple", "Very simple"] },
  { key: "version_pref", q: "Which version would you rather use for your own letters?", options: ["Version A, plain reading", "Version B, SimpliSpeak", "No preference"] },
];
const INTERVIEW = [
  "What was the hardest moment in the tasks? What did you do?",
  "When you changed the level, did you feel you lost your place?",
  "Did you ever doubt that the simple version was correct? When?",
  "Which control did you use most: gestures, voice, keys or buttons? Why?",
  "Clipboard or scanning: which fits your daily life better?",
  "What would you change before you would use this every day?",
];

export function active() { return !!session && step !== null; }

export function init(a) {
  app = a;
  $("btn-study-start").addEventListener("click", startSession);
  $("st-pid").addEventListener("input", showPlan);
  $("btn-study-save").addEventListener("click", saveSession);
  $("btn-export-json").addEventListener("click", exportJSON);
  $("btn-export-csv").addEventListener("click", exportCSV);
  $("btn-study-back").addEventListener("click", () => app.goHome());
  $("btn-study-again").addEventListener("click", showSetup);
  $("int-questions").innerHTML = INTERVIEW.map(q => `<li>${q}</li>`).join("");
}

function planFor(n) {
  const g = n % 4;
  const texts = g % 2 === 0 ? ["leaflet", "bank"] : ["bank", "leaflet"];
  const conds = g < 2 ? ["baseline", "simplispeak"] : ["simplispeak", "baseline"];
  return {
    group: g,
    tasks: [
      { text: "practice", condition: "simplispeak", input: "sample", practice: true },
      { text: texts[0], condition: conds[0], input: "paste" },
      { text: texts[1], condition: conds[1], input: "paste" },
      { text: "bill", condition: "simplispeak", input: "scan" },
    ],
  };
}

function showPlan() {
  const n = parseInt($("st-pid").value, 10);
  const el = $("st-plan");
  el.hidden = Number.isNaN(n);
  if (el.hidden) return;
  const p = planFor(n);
  el.textContent = `Group ${p.group}: ` + p.tasks.map((t, i) => `${i}. ${t.text} (${t.condition === "baseline" ? "A" : "B"}, ${t.input})`).join(" · ") +
    ". Print the bill first: /print.html?doc=bill";
}

export async function showSetup() {
  app.showForm("study-setup");
  $("st-mode").value = app.settings.mode || "audio";
  showPlan();
  try {
    const all = await (await fetch("/api/study/sessions")).json();
    $("st-count").textContent = `${all.length} saved session(s) in study/data/.`;
  } catch { $("st-count").textContent = "Server not reachable; results cannot be listed."; }
}

function banner() {
  const b = $("study-banner");
  if (!session || step === null) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = `Study · ${session.participant} · ` +
    (task ? `${task.practice ? "Practice" : `Task ${taskIdx} of ${session.plan.length - 1}`} · ${task.condition === "baseline" ? "Version A" : "Version B"}` : "Questionnaires");
}

function startSession() {
  const n = parseInt($("st-pid").value, 10);
  if (Number.isNaN(n)) return app.say("Enter a participant number first.", { assertive: true });
  if (!$("st-consent").checked) return app.say("Please record consent first.", { assertive: true });
  app.setMode($("st-mode").value);
  const plan = planFor(n);
  session = {
    participant: `P${String(n).padStart(2, "0")}`, group: plan.group, plan: plan.tasks, mode: $("st-mode").value,
    vision: $("st-vision").value, screen_reader: $("st-sr").value, age: $("st-age").value,
    started_at: new Date().toISOString(), user_agent: navigator.userAgent,
    tasks: [], sus: null, post: {}, notes: "",
  };
  taskIdx = -1;
  nextTask();
}

// ---------------- Tasks ----------------
function nextTask() {
  taskIdx++;
  if (taskIdx >= session.plan.length) return startQuestionnaires();
  const p = session.plan[taskIdx];
  task = { index: taskIdx, ...p, events: [], answers: [], tlx: null, started_at: new Date().toISOString() };
  session.tasks.push(task);
  app.setCondition(p.condition);
  app.setLogSink(e => task.events.push(e));
  step = "brief";
  banner();
  const what = { practice: "a short practice note", leaflet: "a medicine leaflet", bank: "a letter from a bank", bill: "an electricity bill" }[p.text];
  const version = p.condition === "baseline"
    ? "This is version A. The text is read exactly as written. You can play, pause, go to the next or previous part, and repeat."
    : "This is version B, SimpliSpeak. You can also make it simpler or more detailed, explain hard words, and hear the original wording.";
  const how = {
    sample: "When you start, the text opens straight away.",
    paste: "When you start, I copy the text to the clipboard. Then choose Paste from clipboard in the home menu.",
    scan: "The bill is printed on paper in front of you. When you start, choose Scan paper in the home menu, and follow my guidance.",
  }[p.input];
  const brief = `You will listen to ${what}. ${version} ${how} Listen until you understand it. Afterwards I will ask ${p.practice ? "two" : "four"} short questions.`;
  app.openMenu({
    name: "brief", title: p.practice ? "Practice" : `Task ${taskIdx}`, prompt: `${p.practice ? "Practice" : `Task ${taskIdx}`}. ${brief}`,
    visiblePrompt: brief, noHint: taskIdx > 0,
    items: [
      { label: "Start the task", cmd: "yes", ico: "▶", choose: beginTask },
      { label: "Hear the instructions again", cmd: "repeat", ico: "↻", choose: () => app.say(brief) },
    ],
  });
}

async function beginTask() {
  task.t_start = performance.now();
  app.log("task_start", { task: task.text, condition: task.condition });
  if (task.input === "sample") {
    step = "listening"; banner();
    return app.openDoc(await app.loadSample(task.text));
  }
  step = "await_input";
  if (task.input === "paste") {
    const doc = await app.loadSample(task.text);
    try { await navigator.clipboard.writeText(doc.sentences.map(s => s.original).join(" ")); }
    catch { app.log("clipboard_write_failed"); }
    app.goHome("The text is on the clipboard. Find Paste from clipboard and choose it.");
  } else {
    app.goHome("Find Scan paper and choose it.");
  }
}

function similarity(a, b) {
  const words = t => new Set((t.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2));
  const A = words(a), B = words(b);
  let hit = 0;
  A.forEach(w => { if (B.has(w)) hit++; });
  return B.size ? hit / B.size : 0;
}

/** During a study task, any text brought in loads the controlled task text (with hand-written levels). */
export async function intercept(text, source) {
  if (!session || step !== "await_input") return null;
  const doc = await app.loadSample(task.text);
  task.input_used = source;
  task.input_ms = Math.round(performance.now() - task.t_start);
  task.input_similarity = Math.round(similarity(text, doc.sentences.map(s => s.original).join(" ")) * 100) / 100;
  app.log("study_input", { source, similarity: task.input_similarity });
  step = "listening"; banner();
  return doc;
}

export async function afterListen() {
  task.listen_ms = Math.round(performance.now() - task.t_start);
  task.levels_used = [...new Set(task.events.filter(e => e.event === "part_start").map(e => e.level))];
  task.final_level = app.LEVELS[app.state.level].key;
  app.log("task_listen_done");
  step = "questions";
  const doc = await app.loadSample(task.text);
  askQuestions(doc.questions, 0);
}

// ---------------- Comprehension questions ----------------
function askQuestions(qs, i) {
  if (i >= qs.length) {
    task.score = task.answers.filter(a => a.correct).length / task.answers.length;
    if (task.practice) return nextTask();
    return askTLX();
  }
  const q = qs[i];
  const shownAt = performance.now();
  app.openMenu({
    name: "question", title: `Question ${i + 1} of ${qs.length}`, prompt: `Question ${i + 1}. ${q.q}`, visiblePrompt: q.q,
    numbered: true, noHint: true,
    items: q.options.map((opt, j) => ({
      label: opt, ico: String(j + 1),
      choose: () => {
        task.answers.push({ q: q.q, chosen: j, answer: q.answer, correct: j === q.answer, ms: Math.round(performance.now() - shownAt) });
        app.say(`You chose ${opt}.`).then(() => askQuestions(qs, i + 1));
      },
    })),
  });
}

// ---------------- Rating scales ----------------
function rate({ name, title, prompt, scale, low, high }, onAnswer) {
  app.openMenu({
    name, title, prompt: `${prompt} Choose 1 for ${low}, up to ${scale} for ${high}.`, visiblePrompt: prompt,
    numbered: true, noHint: true,
    items: Array.from({ length: scale }, (_, k) => ({
      label: k === 0 ? `1, ${low}` : k === scale - 1 ? `${scale}, ${high}` : String(k + 1),
      choose: () => app.say(String(k + 1)).then(() => onAnswer(k + 1)),
    })),
  });
}

function askTLX() {
  step = "ratings";
  task.tlx = {};
  const ask = i => {
    if (i >= TLX_ITEMS.length) {
      // Raw TLX: map 1-7 to 0-100 and average the six subscales.
      const vals = Object.values(task.tlx).map(v => ((v - 1) / 6) * 100);
      task.rtlx = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      task.finished_at = new Date().toISOString();
      return nextTask();
    }
    const it = TLX_ITEMS[i];
    rate({ name: "tlx", title: `Rating ${i + 1} of 6`, prompt: (i === 0 ? "Six short ratings about this task. " : "") + it.text,
      scale: 7, low: it.low, high: it.high }, v => { task.tlx[it.key] = v; ask(i + 1); });
  };
  ask(0);
}

function startQuestionnaires() {
  task = null;
  step = "ratings";
  app.setLogSink(null);
  app.setCondition("simplispeak");
  banner();
  const sus = [];
  const askSUS = i => {
    if (i >= SUS_ITEMS.length) {
      session.sus = { items: sus, score: sus.reduce((s, v, k) => s + (k % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5 };
      return askPost(0);
    }
    rate({ name: "sus", title: `Statement ${i + 1} of 10`,
      prompt: (i === 0 ? "All tasks are done. Now ten statements about version B, SimpliSpeak. " : "") + SUS_ITEMS[i],
      scale: 5, low: "strongly disagree", high: "strongly agree" }, v => { sus.push(v); askSUS(i + 1); });
  };
  askSUS(0);
}

function askPost(i) {
  if (i >= POST_RATINGS.length) return askChoice(0);
  const r = POST_RATINGS[i];
  rate({ name: "post", title: "Trust and control", prompt: r.text, scale: 5, low: "strongly disagree", high: "strongly agree" },
    v => { session.post[r.key] = v; askPost(i + 1); });
}

function askChoice(i) {
  if (i >= POST_CHOICES.length) {
    step = "notes";
    app.showForm("study-notes");
    return app.say("Thank you. The facilitator will now ask you a few questions.");
  }
  const c = POST_CHOICES[i];
  app.openMenu({
    name: "preference", title: "Your preference", prompt: c.q, numbered: true, noHint: true,
    items: c.options.map((opt, j) => ({
      label: opt, ico: String(j + 1),
      choose: () => { session.post[c.key] = opt; app.say(`You chose ${opt}.`).then(() => askChoice(i + 1)); },
    })),
  });
}

async function saveSession() {
  session.notes = $("st-notes").value;
  session.finished_at = new Date().toISOString();
  task = null; step = null;
  banner();
  app.setCondition("simplispeak");
  try { localStorage.setItem(`simplispeak.session.${session.participant}`, JSON.stringify(session)); } catch { /* blocked */ }
  let where = "Saved in this browser only (server not reachable). Use Download all on the study screen.";
  try {
    const r = await (await fetch("/api/study/save", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(session),
    })).json();
    if (r.saved) where = `Saved to ${r.saved}.`;
  } catch { /* keep local copy */ }
  $("st-saved").textContent = where;
  app.showForm("study-end");
  app.say("Thank you. The session is saved.");
  session = null;
}

// ---------------- Export ----------------
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function allSessions() {
  try { return await (await fetch("/api/study/sessions")).json(); }
  catch {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("simplispeak.session.")) out.push(JSON.parse(localStorage.getItem(k)));
      }
    } catch { /* blocked */ }
    return out;
  }
}

async function exportJSON() { download("simplispeak_sessions.json", JSON.stringify(await allSessions(), null, 1), "application/json"); }

function summaryRows(sessions) {
  const rows = [];
  for (const s of sessions) {
    for (const t of s.tasks) {
      if (t.practice) continue;
      const acts = t.events.filter(e => e.event === "action" && e.modality !== "auto");
      const count = f => acts.filter(f).length;
      rows.push({
        participant: s.participant, group: s.group, mode: s.mode, vision: s.vision, task: t.text, condition: t.condition,
        input: t.input_used || t.input, listen_s: t.listen_ms ? (t.listen_ms / 1000).toFixed(1) : "",
        score: t.score ?? "", rtlx: t.rtlx ?? "",
        level_changes: count(e => e.action === "simpler" || e.action === "detail"),
        explains: count(e => e.action === "explain"), originals: count(e => e.action === "original"),
        repeats: count(e => e.action === "repeat"), voice: count(e => e.modality === "voice"),
        gesture: count(e => e.modality === "gesture"), keyboard: count(e => e.modality === "keyboard"),
        button: count(e => e.modality === "button"), final_level: t.final_level || "", sus: s.sus?.score ?? "",
      });
    }
  }
  return rows;
}

async function exportCSV() {
  const rows = summaryRows(await allSessions());
  if (!rows.length) return app.say("No sessions yet.");
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
  download("simplispeak_summary.csv", csv, "text/csv");
}
