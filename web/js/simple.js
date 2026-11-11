// SimpliSpeak. Voice-guided: every screen is read aloud when it opens, then the app listens for an answer.
// Everything can also be done with big buttons. The whole text stays on screen, current sentence highlighted.
import {
  settings, speak, stopSpeaking, unlockSpeech, hooks, listenOnce, stopListening, voiceSupported, ttsSupported, earcon,
} from "./audio.js";
import * as audio from "./audio.js";
import { attachGestures } from "./gestures.js";

const $ = id => document.getElementById(id);
const LEVELS = [
  { key: "original", name: "Original", desc: "the exact words of the source" },
  { key: "light", name: "Light", desc: "plain words, same sentences" },
  { key: "simple", name: "Simple", desc: "short sentences" },
  { key: "very_simple", name: "Very simple", desc: "very short, one idea each" },
];
const state = {
  doc: null, idx: 0, level: 2, playing: false, run: 0, ai: false,
  view: "input", voiceUI: true,          // voiceUI: the app speaks. false: the user's screen reader does.
  lang: "en",                            // language of the simple version: "en" or "hi"
  always: false, nowSaying: "",          // always: keep the microphone open while reading (for headphones)
  hearBetween: false,                    // optional ("listen after each sentence"): beep and listen between sentences
  blind: false, gi: -1, gctx: "",        // blind: touch layer on (swipe to explore, double tap to choose)
  samples: [], listenToken: 0, expectPhoto: false,
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const escapeHtml = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const wordCount = t => (t.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
const reg = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

try { const r = parseFloat(localStorage.getItem("ss.rate")); if (r >= 0.6 && r <= 1.8) settings.rate = r; } catch { /* storage blocked */ }
try { if (localStorage.getItem("ss.lang") === "hi") state.lang = "hi"; } catch { /* storage blocked */ }
const HI = "hi-IN";
const langName = l => (l === "hi" ? "Hindi" : "English");
const T = (en, hi) => (state.lang === "hi" ? hi : en);                    // what the app says, in the chosen language
const LEVEL_HI = ["मूल", "हल्का आसान", "आसान", "बहुत आसान"];
const levelName = l => T(LEVELS[l].name, LEVEL_HI[l]);
settings.lang = state.lang === "hi" ? "hi-IN" : "en-IN";                 // the microphone listens in that language too

// ---------- output: the app's voice, or the user's screen reader ----------
let toastTimer;
function toast(text, ms = 0) {
  const t = $("toast");
  clearTimeout(toastTimer);
  t.textContent = text; t.hidden = !text;
  if (text && ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function announce(text) { const l = $("live"); l.textContent = ""; setTimeout(() => { l.textContent = text; }, 50); }
/** Say something. Resolves true when finished (or false if something interrupted it). */
function say(text) {
  if (state.voiceUI) return speak(text, /[\u0900-\u097F]/.test(text) ? { lang: HI } : {});
  announce(text);
  return Promise.resolve(true);
}

function show(view) {
  if (state.view === "cam" && view !== "cam") stopCamera();
  state.view = view;
  state.listenToken++;                                  // anything we were listening for is now stale
  stopListening();
  toast("");                                            // and so is its "Listening…" banner
  $("tap-paste").hidden = true;
  $("a-listen").classList.remove("on"); $("s-listen").classList.remove("on");
  for (const v of ["input", "samples", "cam", "work", "read"]) $(`v-${v}`).hidden = v !== view;
  $("player").hidden = view !== "read";
  document.body.classList.toggle("reading", view === "read");   // the banner sits above the player only when there is one
  state.gi = -1;
  window.scrollTo(0, 0);
}

// ---------- what each screen says when it opens ----------
const sampleName = s => s.title.replace(/^[^:]+:\s*/, "");
const lk = () => LEVELS[state.level].key;
const n = () => state.doc.sentences.length;

const touchHelp = () => state.blind && state.lang === "hi" ? "टच मोड चालू है। अगला बटन सुनने के लिए दाईं ओर स्वाइप करें, पिछले के लिए बाईं ओर। चुनने के लिए कहीं भी दो बार टैप करें। यह स्क्रीन दोबारा सुनने के लिए उंगली दबाकर रखें। " : state.blind
  ? "Touch mode is on. Swipe right to hear the next button, swipe left for the previous one. Double tap anywhere to choose the button I just said. Hold your finger down to hear this screen again. "
  : "";
const SCRIPTS = {
  input: () => state.lang === "hi" ? "सिंपलीस्पीक। मुश्किल बातें, आसान शब्दों में। मैं कठिन लिखी बातों को आसान शब्दों में बदलकर पढ़कर सुनाता हूँ, और आप तय करते हैं कि कितना आसान। स्क्रीन पर तीन बड़े बटन हैं। सबसे ऊपर पेस्ट, कॉपी किया हुआ टेक्स्ट लाने के लिए। बीच में फोटो, किसी कागज़ की फोटो लेने के लिए। सबसे नीचे उदाहरण सुनें। आप बस बोल भी सकते हैं: पेस्ट, फोटो, या उदाहरण। आसान रूप हिंदी में होगा। अंग्रेज़ी के लिए इंग्लिश बोलें। " + touchHelp() + "मदद के लिए मदद बोलें।" : "SimpliSpeak. Hard text, said simply. I rewrite hard text in easier words and read it out loud, and you choose how simple. " +
    "There are three big buttons. The top one is Paste, to use text you copied. The middle one is Photo of paper, to take a picture of a letter. " +
    "The bottom one is Hear an example. You can also just say: paste, photo, or example. " +
    `The simple version will be in ${langName(state.lang)}. Say Hindi or English to change it. ` + touchHelp() +
    "Say help for instructions, or say read screen to hear this again.",
  samples: () => state.lang === "hi"
    ? "एक उदाहरण चुनें। " + state.samples.map((s, i) => `${i + 1}: ${sampleLabel(s)}.`).join(" ") +
      (state.blind ? " हर एक सुनने के लिए स्वाइप करें, चुनने के लिए दो बार टैप करें।" : " बटन दबाएँ, या नंबर बोलें।") + " वापस जाने के लिए वापस बोलें।"
    : "Choose an example. " + state.samples.map((s, i) => `${i + 1}: ${sampleLabel(s)}.`).join(" ") +
    (state.blind ? " Swipe right or left to hear each one, and double tap to choose." : " Tap a button, or say a number or a name.") + " Say back to go back.",
  work: () => T("Please wait. I am working on your text.", "कृपया रुकिए। मैं आपके टेक्स्ट पर काम कर रहा हूँ।"),
  cam: () => T("Camera. Hold the phone flat above the page; I take the photo by myself when it is steady. Buttons: Take the photo now, Use the phone's camera app, Back.",
    "कैमरा। फ़ोन को कागज़ के ऊपर सीधा रखें; स्थिर होने पर मैं खुद फोटो ले लूँगा। बटन: अभी फोटो लें, फ़ोन का कैमरा ऐप, वापस।"),
  read: () => state.lang === "hi"
    ? `${docTitle(state.doc)}. ${n()} में से हिस्सा ${state.idx + 1}. स्तर ${levelName(state.level)}। ` + (state.playing ? "मैं पढ़ रहा हूँ। " : "रुका हुआ है। ") +
      (state.blind ? "बटन सुनने के लिए दाएँ या बाएँ स्वाइप करें, चुनने के लिए दो बार टैप करें। और आसान के लिए ऊपर स्वाइप करें, विस्तार के लिए नीचे। दो उंगलियों से टैप करने पर रुकता या चलता है। "
        : "नीचे बटन हैं: पिछला, चलाएँ या रोकें, अगला, धीमा, तेज़, और माइक। ") + "या बोलें: और आसान, विस्तार से, मूल, रुको, चलाओ, या मदद।"
    : `${docTitle(state.doc)}. Part ${state.idx + 1} of ${n()}. Level ${LEVELS[state.level].name}, which means ${LEVELS[state.level].desc}. ` +
    (state.playing ? "I am reading now. " : "I am paused. ") +
    (state.blind
      ? "Swipe right or left to hear the buttons, and double tap to choose. Swipe up for simpler, swipe down for more detail. Two-finger tap pauses or plays. Hold to hear this again."
      : "The buttons at the bottom are: previous, play or pause, next, slower, faster, and the microphone.") +
    " Or say: simpler, more detail, original, pause, play, or help.",
};
const HELP_SPOKEN_HI = "मदद। सिंपलीस्पीक कठिन बातों को आसान शब्दों में बदलकर पढ़ता है। पहली स्क्रीन पर बोलें: पेस्ट, फोटो, या उदाहरण। " +
  "पढ़ते समय बोलें: आगे, पीछे, फिर से, रुको, चलाओ, और आसान, विस्तार से, मूल, तेज़, धीरे, या होम। " +
  "किसी शब्द का मतलब जानने के लिए बोलें: पोटैशियम का मतलब क्या है। स्क्रीन दोबारा सुनने के लिए ऊपर रीड स्क्रीन दबाएँ।";
const HELP_SPOKEN = "Help. SimpliSpeak rewrites hard text in easier words and reads it to you. On the first screen, say paste, photo, or example. " +
  "While I read, say next, back, repeat, pause, play, simpler, more detail, original, faster, slower, explain a word, where am I, or home. " +
  "To explain a word, say: what does, then the word, mean. At any time, press Read screen at the top to hear what is on the screen.";

async function readScreen() {
  if (state.view === "read") return say(SCRIPTS.read());
  const v = state.view;
  await say(SCRIPTS[v]());
  if (v === "input" || v === "samples") listenFor(v);
}

// ---------- listening for a spoken answer ----------
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, first: 1, second: 2, third: 3, fourth: 4, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 };
function matchInput(t) {
  if (/पेस्ट|चिपका|कॉपी/.test(t)) return "paste";
  if (/फोटो|फ़ोटो|तस्वीर|कैमरा|कागज़|कागज|स्कैन|फोटू/.test(t)) return "photo";
  if (/उदाहरण|नमूना|सैंपल|एग्ज़ाम्पल|एग्जांपल|उदाहरन/.test(t)) return "example";
  if (/मदद|सहायता|हेल्प/.test(t)) return "help";
  if (/इंग्लिश|अंग्रेज़ी|अंग्रेजी/.test(t)) return "english";
  if (/टाइप|लिखना/.test(t)) return "type";
  if (/दोबारा|फिर से|स्क्रीन/.test(t)) return "readscreen";
  if (/\b(hindi|हिंदी|हिन्दी)\b/.test(t) || /हिंदी|हिन्दी/.test(t)) return "hindi";
  if (/\benglish\b/.test(t)) return "english";
  if (/\b(help|how|instruction)/.test(t)) return "help";
  if (/\b(show buttons|use buttons|i can see)\b/.test(t)) return "buttons";
  if (/\b(read( the)? screen|read again|again|repeat)\b/.test(t)) return "readscreen";
  if (/\b(paste|clipboard|copied|copy)\b/.test(t)) return "paste";
  if (/\b(photo|picture|scan|camera|paper|letter|snap)\b/.test(t)) return "photo";
  if (/\b(example|sample|demo|hear)\b/.test(t)) return "example";
  if (/\b(type|keyboard|write)\b/.test(t)) return "type";
  return null;
}
const HI_NUM = { "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पहला": 1, "दूसरा": 2, "तीसरा": 3, "चौथा": 4, "१": 1, "२": 2, "३": 3, "४": 4 };
const SAMPLE_WORDS = { practice: /लाइब्रेरी|पुस्तकालय|library/, leaflet: /दवा|दवाई|टैबलेट|लिसिनॉर|medicine/, bank: /बैंक|केवाईसी|kyc|bank/, bill: /बिजली|बिल|bill|electricity/ };
function matchSample(t) {
  for (const [w, k] of Object.entries(HI_NUM)) if (t.includes(w) && state.samples[k - 1]) return k - 1;
  const byWord = state.samples.findIndex(s => SAMPLE_WORDS[s.id]?.test(t));
  if (byWord >= 0) return byWord;
  const w = t.match(/\b(one|two|three|four|five|first|second|third|fourth|[1-5])\b/);
  if (w && state.samples[NUM[w[1]] - 1]) return NUM[w[1]] - 1;
  return state.samples.findIndex(s => sampleName(s).toLowerCase().split(/\W+/).filter(x => x.length > 3).some(x => t.includes(x)));
}

/** Open the microphone for one answer on the current screen, and act on it. */
async function listenFor(view, attempt = 0) {
  if (!state.voiceUI || !voiceSupported || state.view !== view) return;
  const my = ++state.listenToken;
  $("a-listen").classList.add("on"); $("s-listen").classList.add("on");
  toast(T("🎤 Listening… speak now", "🎤 सुन रहा हूँ… बोलिए"));
  earcon("listen");
  const r = await listenOnce();
  $("a-listen").classList.remove("on"); $("s-listen").classList.remove("on");
  if (my !== state.listenToken || state.view !== view) return;      // the user pressed something instead
  toast("");
  const t = (r?.transcript || "").toLowerCase();
  const hint = view === "cam" ? T("Say take photo, or back.", "फोटो लो बोलें, या वापस।")
    : view === "input" ? T("Say paste, photo, or example.", "पेस्ट, फोटो, या उदाहरण बोलें।")
    : T(`Say a number from one to ${state.samples.length}, or say back.`, `एक से ${state.samples.length} तक कोई नंबर बोलें, या वापस बोलें।`);
  if (!t) {
    const why = audio.lastVoiceError;
    if (why === "not-allowed" || why === "service-not-allowed") return say("The microphone is blocked, so I cannot listen. Please use the big buttons, or allow the microphone for this page in the browser settings.");
    if (attempt < 2) { await say(T("I did not hear anything. ", "मुझे कुछ सुनाई नहीं दिया। ") + hint); return listenFor(view, attempt + 1); }
    return say(T("I will stop listening now. Press the microphone button, or use the big buttons.", "अब मैं सुनना बंद कर रहा हूँ। माइक बटन दबाएँ, या बड़े बटन इस्तेमाल करें।"));
  }
  toast(`${T("Heard", "सुना")}: “${t}”`, 2000);
  if (view === "samples" && (/\b(back|home|go back)\b/.test(t) || /वापस|पीछे|होम/.test(t))) return goHome();
  if (view === "cam") {
    if (/\b(back|home|cancel)\b/.test(t) || /वापस|पीछे|होम|रद्द/.test(t)) return goHome();
    if (/\b(take|photo|now|capture|click|snap|shoot|picture)\b/.test(t) || /फोटो|फ़ोटो|लो|खींचो|अभी|क्लिक/.test(t)) return camShoot();
  }
  if (view === "input") {
    const m = matchInput(t);
    if (m === "paste") return doPaste();
    if (m === "photo") return doPhoto();
    if (m === "example") return openSamples();
    if (m === "type") { $("typebox").open = true; $("inp").focus(); return say("The typing box is open. Type your text, then press Simplify and read aloud."); }
    if (m === "help") return openHelp();
    if (m === "hindi" || m === "english") { await setLang(m === "hindi" ? "hi" : "en"); return listenFor("input"); }
    if (m === "buttons") { setBlind(false); return say("Touch mode is off. You can now tap the buttons."); }
    if (m === "readscreen") return readScreen();
  } else if (view === "samples") {
    const i = matchSample(t);
    if (i >= 0) return openSample(state.samples[i]);
    if (/\b(read|again)\b/.test(t)) return readScreen();
  }
  if (attempt < 2) { await say(T(`I heard ${t}, but I do not know that. `, `मैंने सुना: ${t}। यह मुझे समझ नहीं आया। `) + hint); return listenFor(view, attempt + 1); }
  return say(T("I will stop listening now. Use the big buttons, or press the microphone button.", "अब मैं सुनना बंद कर रहा हूँ। बड़े बटन इस्तेमाल करें, या माइक बटन दबाएँ।"));
}


// ---------- the whole interface in Hindi (screen text, button names spoken in touch mode, messages) ----------
const HI_SAMPLE = { practice: "लाइब्रेरी का नोट", leaflet: "दवा का पर्चा: लिसिनॉर 10 mg", bank: "बैंक का पत्र: KYC अपडेट", bill: "बिजली का बिल" };
const HI_KIND = { "Practice text": "अभ्यास", "Health": "स्वास्थ्य", "Money": "पैसे" };
const sampleLabel = s => (state.lang === "hi" && HI_SAMPLE[s.id]) || sampleName(s);
const kindLabel = k => (state.lang === "hi" && HI_KIND[k]) || k;
const docTitle = d => state.lang !== "hi" ? d.title : (d.id && HI_SAMPLE[d.id]) || "आपका टेक्स्ट";   // no English first words in a Hindi intro
const noticeText = d => {
  if (!d.notice) return "";
  if (state.lang !== "hi") return d.notice;
  if (d.engine === "offline" || d.lang === "en") return "AI अभी उपलब्ध नहीं है, इसलिए यह आसान अंग्रेज़ी में है।";
  if (d.id) return "यह एक काल्पनिक उदाहरण है, सिर्फ़ अध्ययन के लिए। यह कोई सलाह नहीं है।";
  return d.notice;
};
const HI_UI = [
  ["#b-read", "text", "🔊 स्क्रीन सुनें"], ["#b-read", "aria", "स्क्रीन पढ़कर सुनाएँ"],
  ["#b-help", "text", "मदद"], ["#b-home", "aria", "सिंपलीस्पीक, शुरुआत पर जाएँ"],
  ["#v-input .hero h1", "text", "मुश्किल बातें, आसान शब्दों में।"],
  ["#v-input .hero .sub", "html", "मैं कठिन बातों को आसान शब्दों में बदलकर <b>पढ़कर सुनाता हूँ</b>। कितना आसान, यह आप तय करें।"],
  ["#lang-lbl", "text", "आसान रूप:"],
  ['#langs button[data-lang="en"]', "aria", "अंग्रेज़ी"], ['#langs button[data-lang="hi"]', "aria", "हिंदी"],
  ["#a-paste b", "text", "पेस्ट"], ["#a-paste small", "text", "कॉपी किया हुआ टेक्स्ट लाएँ"],
  ["#a-scan b", "text", "कागज़ की फोटो"], ["#a-scan small", "text", "किसी चिट्ठी या पर्चे की फोटो लें"],
  ["#a-sample b", "text", "उदाहरण सुनें"], ["#a-sample small", "text", "दवा, बैंक, बिजली बिल, लाइब्रेरी"],
  ["#a-listen", "text", "🎤 बोलकर बताएँ"],
  ["#typebox summary", "text", "या खुद टाइप करें"], ['label[for="inp"]', "text", "आपका टेक्स्ट"],
  ["#inp", "placeholder", "कठिन टेक्स्ट यहाँ टाइप या पेस्ट करें…"], ["#b-go", "text", "आसान बनाकर पढ़ें"],
  ["#b-test", "text", "🔊 आवाज़ जाँचें"], ["#test-note", "text", "आवाज़ फ़ोन के स्पीकर से आती है। कुछ सुनाई न दे तो मीडिया वॉल्यूम बढ़ाएँ।"],
  ["#samples-title", "text", "एक उदाहरण चुनें"], ["#samples-note", "text", "किसी पर टैप करें, या उसका नंबर बोलें।"],
  ["#s-back", "text", "← वापस"], ["#s-listen", "text", "🎤 बोलकर बताएँ"],
  ["#cam-title", "text", "कागज़ की फोटो"], ["#cam-shoot", "text", "📸 अभी फोटो लें"],
  ["#cam-app", "text", "फ़ोन का कैमरा ऐप खोलें"], ["#cam-back", "text", "← वापस"],
  ["#work-note", "text", "कुछ सेकंड लगेंगे।"],
  ["#b-new", "text", "← नया टेक्स्ट"], ["#lbl-level", "text", "कितना आसान चाहिए?"],
  ["#levels", "aria", "आसान होने का स्तर"],
  ['#levels button[data-level="0"] b', "text", "मूल"], ['#levels button[data-level="0"] small', "text", "जैसा लिखा है"],
  ['#levels button[data-level="1"] b', "text", "हल्का आसान"], ['#levels button[data-level="1"] small', "text", "सीधे शब्द"],
  ['#levels button[data-level="2"] b', "text", "आसान"], ['#levels button[data-level="2"] small', "text", "छोटे वाक्य"],
  ['#levels button[data-level="3"] b', "text", "बहुत आसान"], ['#levels button[data-level="3"] small', "text", "हर वाक्य में एक बात"],
  ["#cmd-sum", "text", "मैं क्या बोल सकता हूँ?"],
  ["#cmd-list", "html", "<b>रुको</b> <b>चलाओ</b> <b>आगे</b> <b>पीछे</b> <b>फिर से</b> <b>और आसान</b> <b>विस्तार से</b> <b>मूल</b> <b>तेज़</b> <b>धीरे</b> <b>मैं कहाँ हूँ</b> <b>पोटैशियम का मतलब क्या है</b> <b>होम</b>"],
  ["#cmd-note", "text", "नीचे दाईं ओर 🎤 दबाएँ (या दो उंगलियों से ऊपर स्वाइप करें), फिर बोलें। सुनते समय पढ़ना रुक जाता है। हेडफ़ोन हों तो नीचे “हमेशा सुनें” चालू करें।"],
  ["#lbl-listen", "html", "सुनें <span class=\"hint\">किसी वाक्य पर टैप करें तो वही पढ़ूँगा। <u>रेखांकित शब्द</u> पर टैप करें तो उसका मतलब।</span>"],
  ["#show-orig-t", "text", "हर वाक्य के नीचे मूल शब्द दिखाएँ"],
  ["#always-t", "text", "🎧 हमेशा सुनें (हेडफ़ोन लगाएँ, ताकि मैं अपनी आवाज़ न सुनूँ)"],
  ["#end-q", "text", "पूरा पाठ हो गया। क्या समझ आया?"], ["#b-yes", "text", "हाँ, समझ आया"], ["#b-no", "text", "नहीं, और आसान करें"],
  ["#p-back", "aria", "पिछला वाक्य"], ["#p-next", "aria", "अगला वाक्य"], ["#p-slow", "aria", "धीमा"], ["#p-fast", "aria", "तेज़"], ["#p-mic", "aria", "बोलकर बताएँ"],
  ["#sheet-close", "text", "बंद करें और आगे पढ़ें"], ["#help-close", "text", "मदद बंद करें"],
  ["#voice-banner", "text", "🔊 आवाज़ नहीं आ रही? चालू करने के लिए यहाँ टैप करें"],
];
function applyLang() {
  for (const [sel, prop, hi] of HI_UI) {
    document.querySelectorAll(sel).forEach(el => {
      const key = "en_" + prop;
      if (el.dataset[key] === undefined) {
        el.dataset[key] = prop === "text" ? el.textContent : prop === "html" ? el.innerHTML
          : prop === "aria" ? (el.getAttribute("aria-label") || "") : (el.getAttribute("placeholder") || "");
      }
      const v = state.lang === "hi" ? hi : el.dataset[key];
      if (prop === "text") el.textContent = v;
      else if (prop === "html") el.innerHTML = v;
      else if (prop === "aria") { if (v) el.setAttribute("aria-label", v); else el.removeAttribute("aria-label"); }
      else el.setAttribute("placeholder", v);
    });
  }
  document.documentElement.lang = state.lang === "hi" ? "hi" : "en";
  $("help-en").hidden = state.lang === "hi";
  $("help-hi").hidden = state.lang !== "hi";
  renderSampleButtons();
  renderStatus();
  if (state.doc && state.view === "read") { $("title").textContent = docTitle(state.doc); $("notice").textContent = noticeText(state.doc); render(); }
}

// ---------- camera inside the app (works by voice too: no fresh tap needed) ----------
let camStream = null, camTimer = null, camPrev = null, camSteady = 0, camBusy = false, camLastMsg = "", camLastAt = 0;
async function openCamera() {
  unlockSpeech();
  show("cam");
  camBusy = false; camSteady = 0; camPrev = null; camLastMsg = ""; camLastAt = Date.now() + 4000;   // let the intro finish first
  $("cam-guide").textContent = T("Starting the camera…", "कैमरा चालू हो रहा है…");
  say(T("Camera. Hold the phone flat, about thirty centimetres above the page. I will tell you when it is good and take the photo by myself. You can also press Take the photo now.",
    "कैमरा। फ़ोन को कागज़ से लगभग एक फुट ऊपर सीधा पकड़ें। सही होने पर मैं खुद फोटो ले लूँगा। आप अभी फोटो लें बटन भी दबा सकते हैं।"));
  if (!navigator.mediaDevices?.getUserMedia) return camFail();
  try {
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    if (state.view !== "cam") { st.getTracks().forEach(t => t.stop()); return; }
    camStream = st;
    const v = $("cam-video");
    v.srcObject = st;
    await v.play();
    clearInterval(camTimer);
    camTimer = setInterval(checkCam, 900);
  } catch { camFail(); }
}
function camFail() {
  const m = T("I cannot open the camera here. Allow the camera for this page, or press Use the phone's camera app.",
    "यहाँ कैमरा नहीं खुल रहा। इस पेज के लिए कैमरा की अनुमति दें, या फ़ोन का कैमरा ऐप वाला बटन दबाएँ।");
  $("cam-guide").textContent = m;
  say(m);
}
function stopCamera() {
  clearInterval(camTimer); camTimer = null;
  camStream?.getTracks().forEach(t => t.stop());
  camStream = null; camPrev = null;
}
function camGuide(en, hi) {
  const msg = T(en, hi);
  $("cam-guide").textContent = msg;
  const now = Date.now();
  if (msg !== camLastMsg && now - camLastAt > 3500) { camLastMsg = msg; camLastAt = now; say(msg); }
}
function checkCam() {
  const v = $("cam-video");
  if (!v.videoWidth || camBusy || state.view !== "cam") return;
  const c = document.createElement("canvas"); c.width = 64; c.height = 48;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(v, 0, 0, 64, 48);
  const d = g.getImageData(0, 0, 64, 48).data, gray = new Float32Array(64 * 48);
  let sum = 0, diff = 0, edges = 0;
  for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    if (camPrev) diff += Math.abs(gray[i] - camPrev[i]);
    if (i % 64 < 63) edges += Math.abs(gray[i] - gray[i + 1]);
  }
  const bright = sum / gray.length, motion = camPrev ? diff / gray.length : 99, detail = edges / gray.length;
  camPrev = gray;
  let ok = false;
  if (bright < 60) camGuide("Too dark. Find more light.", "बहुत अँधेरा है। ज़्यादा रोशनी में ले जाएँ।");
  else if (motion > 14) camGuide("Hold still.", "फ़ोन स्थिर रखें।");
  else if (detail < 6) camGuide("I cannot see text. Move the phone slowly over the page.", "मुझे लिखा हुआ नहीं दिख रहा। फ़ोन को धीरे-धीरे कागज़ के ऊपर लाएँ।");
  else { ok = true; camGuide("Good. Keep still.", "ठीक है। ऐसे ही रखें।"); }
  camSteady = ok ? camSteady + 1 : 0;
  if (camSteady >= 3) camShoot("auto");
}
function camShoot() {
  if (camBusy) return;
  const v = $("cam-video");
  if (!v.videoWidth) return camFail();
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  camBusy = true;
  earcon("success");
  stopCamera();
  processPhoto(c);
}
$("cam-shoot").addEventListener("click", () => { unlockSpeech(); camShoot(); });
$("cam-app").addEventListener("click", () => { unlockSpeech(); stopCamera(); state.expectPhoto = true; $("file").click(); });
$("cam-back").addEventListener("click", () => { unlockSpeech(); goHome(); });

// ---------- start up ----------
function setBlind(on) {
  state.blind = on; state.gi = -1;
  $("gs").hidden = !on;
  document.body.classList.toggle("blind", on);
}
function begin(mode) {                                  // "blind" (touch + voice), "see" (buttons + voice), "sr" (screen reader)
  unlockSpeech();                                       // must be inside the tap
  state.voiceUI = mode !== "sr";
  setBlind(mode === "blind");
  $("welcome").hidden = true;
  show("input");
  if (state.voiceUI) readScreen();
  else { announce("SimpliSpeak. Hard text, said simply. Use Paste, Photo of paper, or Hear an example."); $("a-paste").focus(); }
}
$("w-start").addEventListener("click", () => begin("blind"));
$("w-see").addEventListener("click", () => begin("see"));
$("w-sr").addEventListener("click", () => begin("sr"));

// ---------- touch layer: how a blind person picks a button without anyone reading to them ----------
const plain = el => (el.getAttribute("aria-label") || el.innerText || "").replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").replace(/\s+/g, " ").trim();
function focusables() {
  const A = sel => [...document.querySelectorAll(sel)];
  if (!$("help").hidden) return [$("help-close")];
  if (!$("sheet").hidden) return [$("sheet-close")];
  const top = [$("b-read"), $("b-help")];
  if (state.view === "input") return [$("a-paste"), $("a-scan"), $("a-sample"), ...A("#langs button"), $("a-listen"), ...top, $("b-test")];
  if (state.view === "samples") return [...A("#samples button"), $("s-back"), $("s-listen"), ...top];
  if (state.view === "cam") return [$("cam-shoot"), $("cam-app"), $("cam-back"), ...top];
  if (state.view === "read") return [...($("end").hidden ? [] : [$("b-yes"), $("b-no")]), $("p-play"), $("p-back"), $("p-next"),
    ...A("#levels button"), $("p-slow"), $("p-fast"), $("p-mic"), ...top, $("b-new")];
  return [];
}
function describe(el) {
  const b = el.querySelector("b"), sm = el.querySelector("small");
  let t = b && sm ? `${plain(b)}. ${plain(sm)}` : plain(el);          // name, a pause, then the description
  const sel = el.getAttribute("aria-checked") === "true" ? T("Selected", "चुना हुआ") : T("Not selected", "नहीं चुना");
  if (el.dataset.lang) t = T(`Simple version in ${el.getAttribute("aria-label")}. ${sel}`, `आसान रूप ${el.getAttribute("aria-label")} में। ${sel}`);
  else if (el.getAttribute("role") === "radio") t = T(`Level ${plain(b)}, ${plain(sm)}. ${sel}`, `स्तर ${plain(b)}, ${plain(sm)}। ${sel}`);
  return t;
}
const ctxKey = () => (!$("help").hidden ? "help" : !$("sheet").hidden ? "sheet" : state.view + (!$("end").hidden ? "+end" : ""));
function moveFocus(d) {
  const items = focusables();
  if (!items.length) return say(T("Nothing to choose here. Please wait.", "अभी यहाँ चुनने को कुछ नहीं है। कृपया रुकिए।"));
  state.gi = state.gi < 0 ? (d > 0 ? 0 : items.length - 1) : (state.gi + d + items.length) % items.length;
  document.querySelectorAll(".gfocus").forEach(e => e.classList.remove("gfocus"));
  const el = items[state.gi];
  el.classList.add("gfocus");
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  earcon("tick");
  return say(`${describe(el)}. ` + T(`${state.gi + 1} of ${items.length}.`, `${items.length} में से ${state.gi + 1}।`));
}
function activateFocus() {
  const items = focusables(), el = items[state.gi];
  if (!el) return say(T("Nothing selected. Swipe right to hear a button, then double tap.", "कुछ चुना नहीं है। बटन सुनने के लिए दाईं ओर स्वाइप करें, फिर दो बार टैप करें।"));
  earcon("success");
  document.querySelectorAll(".gfocus").forEach(e => e.classList.remove("gfocus"));
  state.gi = -1;
  el.click();
}
attachGestures($("gs"), g => {
  unlockSpeech();
  $("gs").classList.add("flash"); setTimeout(() => $("gs").classList.remove("flash"), 150);
  state.listenToken++; stopListening();                 // a touch always wins over the microphone
  if (state.gctx !== ctxKey()) { state.gctx = ctxKey(); state.gi = -1; }
  const inRead = state.view === "read" && $("help").hidden && $("sheet").hidden;
  const wasPlaying = state.playing;
  if (g === "twofingertap") {
    if (inRead) { if (state.playing) { pause(); return say(T("Paused.", "रोक दिया।")); } return playFrom(!$("end").hidden ? 0 : state.idx); }
    return readScreen();
  }
  if (inRead && state.playing) pause();                 // any touch stops the reading, like a screen reader
  switch (g) {
    case "swiperight": return moveFocus(1);
    case "swipeleft": return moveFocus(-1);
    case "doubletap":
      if (state.gi < 0 && state.view === "cam") return camShoot();                    // nothing selected: take the photo
      if (state.gi < 0 && !$("sheet").hidden) return closeSheet();                 // nothing selected: close the explanation
      if (state.gi < 0 && !$("help").hidden) return $("help-close").click();
      if (state.gi < 0 && inRead) return wasPlaying ? say(T("Paused.", "रोक दिया।")) : playFrom(!$("end").hidden ? 0 : state.idx);   // nothing selected: play or pause
      return activateFocus();
    case "tap": {
      const el = focusables()[state.gi];
      if (el) return say(describe(el));
      return say(inRead ? T("Double tap to pause or play. Swipe right to hear the buttons.", "रोकने या चलाने के लिए दो बार टैप करें। बटन सुनने के लिए दाईं ओर स्वाइप करें।")
        : T("Swipe right to hear the buttons.", "बटन सुनने के लिए दाईं ओर स्वाइप करें।"));
    }
    case "longpress": stopSpeaking(); return readScreen();
    case "swipeup": return inRead ? setLevel(state.level + 1) : moveFocus(-1);
    case "swipedown": return inRead ? setLevel(state.level - 1) : moveFocus(1);
    case "twoswipedown":
      if (!$("help").hidden) return $("help-close").click();
      if (!$("sheet").hidden) return closeSheet();
      return state.view === "input" ? say("This is the first screen.") : goHome();
    case "twoswipeup": return state.view === "read" ? mic() : listenFor(state.view);
  }
});
$("b-read").addEventListener("click", () => { unlockSpeech(); stopSpeaking(); if (state.view === "read") pause(); readScreen(); });

async function checkStatus() {
  try { state.st = await (await fetch("/api/status")).json(); state.ai = state.st.ai; } catch { state.st = null; }
  renderStatus();
}
function renderStatus() {
  const s = $("status"), st = state.st;
  let text;
  if (st === undefined) text = T("Checking…", "जाँच रहा हूँ…");
  else if (!st) { s.className = "status off"; text = T("Cannot reach the server. Is it running?", "सर्वर से संपर्क नहीं हो रहा। क्या वह चालू है?"); }
  else if (!st.ai) { s.className = "status off"; text = T("AI is off, so only basic simplification is available. Add a key to the .env file.", "AI बंद है, इसलिए सिर्फ़ सामान्य सरलीकरण (अंग्रेज़ी में) होगा।"); }
  else if (st.note) {
    s.className = "status off";
    const allGone = st.note.startsWith("The AI's free daily limit");
    text = T(st.note + (allGone ? " Until then, simplification is basic and English only." : ""),
      allGone ? "AI की आज की मुफ़्त सीमा खत्म हो गई है। तब तक सरलीकरण सामान्य और अंग्रेज़ी में होगा।" : "मुख्य AI की आज की सीमा खत्म है, इसलिए बैकअप AI इस्तेमाल हो रहा है।");
  } else { s.className = "status ai"; text = T(`AI is on (${st.model}).`, `AI चालू है (${st.model})।`); }
  if (!ttsSupported) text += T(" This browser cannot read aloud.", " यह ब्राउज़र पढ़कर नहीं सुना सकता।");
  $("status-text").textContent = text;
}

// ---------- language of the simple version ----------
function paintLangs() {
  document.querySelectorAll("#langs button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.lang === state.lang)));
}
function setLang(l) {
  state.lang = l;
  settings.lang = l === "hi" ? "hi-IN" : "en-IN";
  try { localStorage.setItem("ss.lang", l); } catch { /* storage blocked */ }
  paintLangs();
  toast(l === "hi" ? "आसान रूप: हिंदी" : "Simple version: English", 2000);
  applyLang();
  return l === "hi"
    ? say("ठीक है। अब सब कुछ हिंदी में होगा, और आप हिंदी में बोल सकते हैं।")
    : say("Okay. Everything will now be in English.");
}
$("langs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { unlockSpeech(); stopListening(); state.listenToken++; setLang(b.dataset.lang); } });
paintLangs();

// ---------- adding text ----------
/** Phones let a web page read the clipboard only straight after a tap, and only with permission. */
function askTapToPaste() {
  const b = $("tap-paste");
  b.textContent = T("👆 Tap anywhere to paste", "👆 पेस्ट करने के लिए स्क्रीन पर कहीं भी टैप करें");
  b.hidden = false;
  clearTimeout(askTapToPaste.timer);
  askTapToPaste.timer = setTimeout(() => { b.hidden = true; }, 25000);
  return say(T("To paste, tap anywhere on the screen once. Phones only allow pasting right after a tap.",
    "पेस्ट करने के लिए स्क्रीन पर कहीं भी एक बार टैप करें। फ़ोन टैप के बाद ही पेस्ट करने देता है।"));
}
$("tap-paste").addEventListener("click", () => { $("tap-paste").hidden = true; clearTimeout(askTapToPaste.timer); doPaste(true); });

function offerTyping(msg) {                                   // backup: the typing box, where press-and-hold → Paste works
  $("typebox").open = true;
  $("inp").focus();
  return say(msg);
}

async function doPaste(fromTap = false) {
  unlockSpeech();
  if (!navigator.clipboard?.readText) {
    return offerTyping(T("This browser cannot read the clipboard. Press and hold in the typing box, choose Paste, then press Simplify.",
      "यह ब्राउज़र क्लिपबोर्ड नहीं पढ़ सकता। टाइप करने वाले बॉक्स में उंगली दबाकर रखें, पेस्ट चुनें, फिर आसान बनाएँ दबाएँ।"));
  }
  // A spoken "paste" is not a tap, so the phone would refuse: ask for one tap first.
  if (!fromTap && navigator.userActivation && !navigator.userActivation.isActive) return askTapToPaste();
  let t = "", err = "";
  try { t = await navigator.clipboard.readText(); } catch (e) { err = e?.name || "error"; }
  if (err) {
    earcon("error");
    let blocked = false;
    try { blocked = (await navigator.permissions.query({ name: "clipboard-read" })).state === "denied"; } catch { /* not supported */ }
    if (blocked) {
      return offerTyping(T("Clipboard access is blocked for this page. Allow Clipboard in the browser's site settings, or press and hold in the typing box and choose Paste.",
        "इस पेज के लिए क्लिपबोर्ड बंद है। ब्राउज़र की साइट सेटिंग में क्लिपबोर्ड की अनुमति दें, या टाइप वाले बॉक्स में उंगली दबाकर पेस्ट चुनें।"));
    }
    if (!fromTap) return askTapToPaste();
    await say(T("I need your permission to read what you copied. Press Paste again, and if the phone asks, choose Allow.",
      "कॉपी किया हुआ पढ़ने के लिए आपकी अनुमति चाहिए। पेस्ट दोबारा दबाएँ, और फ़ोन पूछे तो अनुमति दें चुनें।"));
    return listenFor("input");
  }
  if (!t.trim()) {
    earcon("error");
    await say(T("The clipboard is empty. Copy some text in another app first, then say paste again.",
      "क्लिपबोर्ड खाली है। पहले किसी और ऐप में टेक्स्ट कॉपी करें, फिर दोबारा पेस्ट बोलें।"));
    return listenFor("input");
  }
  earcon("success");
  say(T(`Pasted ${wordCount(t)} words. Simplifying. This takes a few seconds.`, `${wordCount(t)} शब्द मिले। आसान बना रहा हूँ, कुछ सेकंड लगेंगे।`));
  simplify(t);
}
$("a-paste").addEventListener("click", () => { stopListening(); state.listenToken++; doPaste(true); });

function doPhoto() { openCamera(); }                    // works by tap and by voice (English or Hindi)
$("a-scan").addEventListener("click", () => { stopListening(); state.listenToken++; doPhoto(); });
window.addEventListener("focus", () => {                // back from the camera app with no photo
  if (!state.expectPhoto) return;
  setTimeout(async () => {
    if (!state.expectPhoto) return;
    state.expectPhoto = false;
    await say(T("No photo was taken. Press the Photo button, or say photo, to try again.", "कोई फोटो नहीं ली गई। दोबारा कोशिश के लिए फोटो बोलें।"));
    if (state.view === "cam") openCamera(); else listenFor("input");
  }, 1500);
});

$("b-go").addEventListener("click", () => {
  unlockSpeech();
  const text = $("inp").value;
  if (!text.trim()) { toast(T("Type some text first.", "पहले कुछ टाइप करें।"), 3000); say(T("The box is empty. Type some text first.", "बॉक्स खाली है। पहले कुछ टाइप करें।")); $("inp").focus(); return; }
  simplify(text);
});

async function simplify(text) {
  show("work");
  $("work-msg").textContent = T("Simplifying your text…", "आपका टेक्स्ट आसान बना रहा हूँ…");
  const ticker = setInterval(() => earcon("tick"), 1200);
  try {
    const res = await fetch("/api/simplify", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: state.lang, title: text.trim().split(/\s+/).slice(0, 7).join(" ") + "…" }) });
    const doc = await res.json();
    if (!res.ok) throw new Error(doc.error || "Something went wrong.");
    openDoc(doc);
  } catch (e) {
    earcon("error");
    show("input");
    await say(T((e.message || "I could not reach the server.") + " Please try again.", "कुछ गड़बड़ हुई। कृपया दोबारा कोशिश करें।"));
    listenFor("input");
  } finally { clearInterval(ticker); }
}

// ---------- photo of paper ----------
$("file").addEventListener("change", e => {
  const f = e.target.files[0];
  e.target.value = "";
  state.expectPhoto = false;
  if (f) processPhoto(f);
});
async function processPhoto(f) {                           // f: a photo file, or a canvas from the camera view
  show("work");
  $("work-msg").textContent = T("Reading the photo…", "फोटो पढ़ रहा हूँ…");
  say(T("Got the photo. Reading it now. This takes a few seconds.", "फोटो मिल गई। अब पढ़ रहा हूँ, कुछ सेकंड लगेंगे।"));
  const ticker = setInterval(() => earcon("tick"), 1200);
  try {
    let text = state.ai ? await readWithAI(f) : null;
    if (text === null) {
      await loadTesseract();
      text = (await window.Tesseract.recognize(f, "eng")).data.text.replace(/\n(?!\n)/g, " ").trim();
    }
    const words = wordCount(text);
    if (words < 4) {
      earcon("error");
      show("input");
      await say(T(`I could only read ${words} word${words === 1 ? "" : "s"}. Try again with more light, and keep the whole page in view. Say photo to try again.`,
        `मैं सिर्फ़ ${words} शब्द पढ़ पाया। ज़्यादा रोशनी में, पूरा कागज़ दिखाते हुए दोबारा कोशिश करें। फोटो बोलें।`));
      return listenFor("input");
    }
    earcon("success");
    $("inp").value = text;
    await say(T(`I read ${words} words. Simplifying now.`, `${words} शब्द पढ़े। अब आसान बना रहा हूँ।`));
    simplify(text);
  } catch (err) {
    earcon("error");
    show("input");
    await say(T((err.message || "I could not read the photo.") + " Please try again.", "फोटो पढ़ी नहीं जा सकी। कृपया दोबारा कोशिश करें।"));
    listenFor("input");
  } finally { clearInterval(ticker); }
}

async function toJpegBase64(blob) {
  let bmp = blob;                                          // a canvas from the camera view is used as it is
  if (blob instanceof Blob) {
    try { bmp = await createImageBitmap(blob); }
    catch { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); }); }
  }
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}
async function readWithAI(blob) {
  try {
    const image = await toJpegBase64(blob);
    const res = await fetch("/api/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, mime: "image/jpeg" }) });
    if (!res.ok) return null;
    return ((await res.json()).text || "").trim();
  } catch { return null; }
}
let tessLoading;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  tessLoading ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = res; s.onerror = () => { tessLoading = null; rej(new Error("I could not read the photo. Check the internet connection.")); };
    document.head.append(s);
  });
  return tessLoading;
}

// ---------- examples ----------
async function loadSamples() {
  try { state.samples = await (await fetch("/api/samples")).json(); } catch { state.samples = []; }
  renderSampleButtons();
}
function renderSampleButtons() {
  $("samples").innerHTML = "";
  state.samples.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "bigact";
    b.innerHTML = `<span class="ico" aria-hidden="true">${i + 1}</span><b>${escapeHtml(sampleLabel(s))}</b><small>${escapeHtml(kindLabel(s.kind))}</small>`;
    b.addEventListener("click", () => { unlockSpeech(); openSample(s); });
    $("samples").append(b);
  });
}
function openSamples() { unlockSpeech(); show("samples"); readScreen(); }
async function openSample(s) {
  unlockSpeech();
  if (state.lang !== "en") {                              // the Hindi version is made by the AI: takes a few seconds
    show("work");
    $("work-msg").textContent = "हिंदी रूप तैयार कर रहा हूँ…";
    say("हिंदी रूप तैयार कर रहा हूँ। कुछ सेकंड लगेंगे।");
  }
  try {
    openDoc(await (await fetch(`/api/samples/${s.id}?lang=${state.lang}`)).json());
  } catch {
    show("input");
    await say(T("I could not load the example. Please try again.", "उदाहरण नहीं खुल पाया। कृपया दोबारा कोशिश करें।"));
    listenFor("input");
  }
}
$("a-sample").addEventListener("click", openSamples);
$("s-back").addEventListener("click", () => goHome());
$("a-listen").addEventListener("click", () => { unlockSpeech(); stopSpeaking(); listenFor("input"); });
$("s-listen").addEventListener("click", () => { unlockSpeech(); stopSpeaking(); listenFor("samples"); });

// ---------- the reader ----------
const unsureNow = i => state.doc.sentences[i].unsure?.[lk()];
/** The level actually used for a sentence: the chosen one, or, if it lost a fact, the next fuller level that kept every fact. */
const safeKey = i => {
  const s = state.doc.sentences[i];
  for (let l = state.level; l >= 1; l--) if (!s.unsure?.[LEVELS[l].key]) return LEVELS[l].key;
  return "original";
};
const shownText = i => { const s = state.doc.sentences[i], k = safeKey(i); return k === "original" ? s.original : s[k]; };
const speechText = i => shownText(i);
const isHindi = i => state.doc.lang === "hi" && safeKey(i) !== "original";
const safetyNote = i => !unsureNow(i) ? "" : safeKey(i) === "original"
  ? T("Careful: the simpler version may have lost a detail. Here is the original.", "ध्यान दें: आसान रूप में कोई ज़रूरी बात छूट सकती थी। इसलिए मूल अंग्रेज़ी सुनिए।")
  : T("Careful: the simplest version left out a detail, so here is a fuller one.", "ध्यान दें: सबसे आसान रूप में कोई ज़रूरी बात छूट गई थी, इसलिए थोड़ा पूरा रूप सुनिए।");

async function openDoc(doc) {
  pause();
  Object.assign(state, { doc, idx: 0, level: Number(settings.startLevel ?? 2) });
  $("title").textContent = docTitle(doc);
  $("notice").hidden = !doc.notice;
  $("notice").textContent = noticeText(doc);
  $("end").hidden = true;
  show("read");
  paintLevels();
  render();
  earcon("success");
  const intro = state.lang === "hi" && doc.lang === "hi"
    ? `${docTitle(doc)}. ${n()} हिस्से। मैं इसे ${levelName(state.level)} हिंदी में पढ़ूँगा। मूल स्तर अंग्रेज़ी में रहेगा। ` +
      (!voiceSupported ? "रोकने या स्तर बदलने के लिए नीचे के बटन दबाएँ। "
        : state.blind ? "कुछ कहना हो तो दो उंगलियों से ऊपर स्वाइप करें, फिर बोलें। दो बार टैप करने से रुकता है। "
        : "कुछ कहना हो तो नीचे दाईं ओर माइक बटन दबाएँ, फिर बोलें। ") + (noticeText(doc) ? noticeText(doc) + " " : "")
    : `${docTitle(doc)}. ${n()} part${n() === 1 ? "" : "s"}. I will read it at level ${LEVELS[state.level].name}` +
    (doc.lang === "hi" ? ", in Hindi. The original level stays in English. " : ". ") +
    (!state.voiceUI ? "Use the buttons at the bottom. "
      : !voiceSupported ? "Use the buttons at the bottom to pause or change the level. "
      : state.blind ? "To give a command, swipe up with two fingers, then speak. Double tap pauses. "
      : "To give a command, press the microphone button at the bottom right, then speak. ") + (noticeText(doc) ? noticeText(doc) + " " : "");
  const my = ++state.run;
  await say(intro);
  if (my !== state.run) return;                         // the user already pressed something
  playFrom(0);
}

function paintLevels() {
  document.querySelectorAll("#levels button").forEach(b => b.setAttribute("aria-checked", String(Number(b.dataset.level) === state.level)));
}
function termHtml(text) {
  const terms = Object.keys(state.doc.glossary || {}).sort((a, b) => b.length - a.length);
  const safe = escapeHtml(text);
  if (!terms.length) return safe;
  const re = new RegExp(`(?<![\\w-])(${terms.map(t => reg(escapeHtml(t))).join("|")})(?![\\w-])`, "gi");
  return safe.replace(re, m => `<u data-term="${m.replace(/"/g, "")}">${m}</u>`);
}
function render() {
  const box = $("sents"), showOrig = $("show-orig").checked;
  box.innerHTML = "";
  state.doc.sentences.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "sent"; d.dataset.i = i; d.tabIndex = 0; d.setAttribute("role", "button");
    if (isHindi(i)) d.lang = "hi";
    let html = termHtml(shownText(i));
    if (unsureNow(i)) html += `<span class="warn">⚠ ${escapeHtml(T("The simpler version may have lost: ", "आसान रूप में यह छूट गया था: ") + unsureNow(i).join(", "))}. ${escapeHtml(safeKey(i) === "original" ? T("This shows the original.", "इसलिए मूल दिखाया है।") : T("This shows a fuller version.", "इसलिए थोड़ा पूरा रूप दिखाया है।"))}</span>`;
    else if (showOrig && lk() !== "original") html += `<span class="orig"><b>Original:</b> ${escapeHtml(s.original)}</span>`;
    d.innerHTML = html;
    box.append(d);
  });
  updateUI();
}
function updateUI() {
  document.querySelectorAll(".sent").forEach(el => el.classList.toggle("now", Number(el.dataset.i) === state.idx));
  $("p-pos").textContent = T(`Part ${state.idx + 1} of ${n()} · ${LEVELS[state.level].name}`, `${n()} में से हिस्सा ${state.idx + 1} · ${levelName(state.level)}`);
  $("p-play").textContent = state.playing ? T("⏸ Pause", "⏸ रोकें") : T("▶ Play", "▶ चलाएँ");
  $("p-play").setAttribute("aria-label", state.playing ? T("Pause", "रोकें") : T("Play", "चलाएँ"));
  $("p-speed").textContent = `${T("Speed", "गति")} ${settings.rate.toFixed(1)}×`;
}
function scrollToNow() { document.querySelector(".sent.now")?.scrollIntoView({ block: "center", behavior: "smooth" }); }

function pause() {
  state.run++; state.playing = false; stopSpeaking(); stopListening(); state.listenToken++;
  if (state.doc) updateUI();
  if (state.always) setTimeout(ensureAlways, 400);
}

/** Read one sentence: with the app voice, or announced to the user's screen reader (timed). */
async function readSentence(text, lang) {
  if (state.voiceUI) return speak(text, { lang });
  announce(text);
  await sleep(Math.max(1800, (wordCount(text) * 430) / settings.rate));
  return true;
}

/** Split a part into sentence-sized turns (about 5 seconds each), so there is a chance to speak often. */
function chunksOf(text) {
  const raw = (text.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) || [text]).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const s of raw) { if (out.length && out[out.length - 1].length < 30) out[out.length - 1] += " " + s; else out.push(s); }
  return out.length ? out : [text];
}

async function playFrom(i, { once = false } = {}) {
  const run = ++state.run;
  state.idx = Math.max(0, Math.min(i, n() - 1));
  state.playing = !once;
  $("end").hidden = true;
  ensureAlways();
  for (;;) {
    updateUI(); scrollToNow();
    const turns = state.voiceUI && voiceSupported && state.hearBetween && !state.always;
    const chunks = turns ? chunksOf(speechText(state.idx)) : [speechText(state.idx)];   // normally: the whole part in one flow
    const note = safetyNote(state.idx);                     // a fact would have been lost: say so first
    if (note) { earcon("unsure"); if (!(await say(note)) || run !== state.run) { if (run === state.run) { state.playing = false; updateUI(); } return; } }
    for (let c = 0; c < chunks.length; c++) {
      state.nowSaying = chunks[c];
      const hindiNow = isHindi(state.idx);
      const ok = await readSentence(chunks[c], hindiNow ? HI : undefined);
      if (run !== state.run) return;                       // another command took over
      if (!ok) { state.playing = false; return updateUI(); }
      const last = c === chunks.length - 1;
      if (last && once) { state.playing = false; return updateUI(); }
      if (last && state.idx >= n() - 1) { state.playing = false; updateUI(); return finish(); }
      if (state.voiceUI && voiceSupported && state.hearBetween && !state.always) {
        const heard = await hearCommand(run);               // a short turn to speak, after every sentence
        if (run !== state.run) return;
        if (heard) { state.run++; stopSpeaking(); return runCommand(heard, true); }
      } else if (last) {
        await sleep(450);                                   // a short, even pause between parts
        if (run !== state.run) return;
        earcon("part");                                     // soft tick: a new part begins
      }
    }
    state.idx++;
  }
}

// ---- always listening (headphones): the microphone stays open, and my own voice is filtered out ----
function ensureAlways() {
  if (state.always && voiceSupported && state.view === "read" && !audio.isContinuous()) audio.startContinuous(onAlways);
}
function onAlways(r) {
  if (!state.always || state.view !== "read") return;
  if ((!$("sheet").hidden || !$("help").hidden) && r.cmd !== "close") return;   // while an explanation is open, only "close" counts
  const t = (r.transcript || "").toLowerCase();
  const words = t.split(/[\s,.?!।]+/).filter(Boolean);              // works for Hindi words too
  const said = (state.nowSaying || "").toLowerCase();
  if (!r.cmd || !words.length || words.length > 5) return;       // too long to be a command: probably my own voice
  if (words.every(w => said.includes(w))) return;                // every word is in what I am saying: my own voice
  toast(`${T("Heard", "सुना")}: “${r.transcript}”`, 1500);
  const was = state.playing;
  state.run++; stopSpeaking();
  runCommand(r, was);
}
function setAlways(on) {
  const was = state.playing, run = ++state.run;
  state.always = on;
  $("always").checked = on;
  let msg;
  if (on) { ensureAlways(); msg = "Always listening. Say pause, simpler, more detail, or original at any time. Please wear headphones."; toast("🎧 Always listening", 2500); }
  else { stopListening(); msg = "Okay. I will listen only after each sentence."; }
  say(msg).then(() => { if (was && run === state.run) playFrom(state.idx); });   // carry on reading afterwards
}
$("always").addEventListener("change", e => { unlockSpeech(); setAlways(e.target.checked); });

const CMD_LIST_HI = "आप बोल सकते हैं: रुको, चलाओ, आगे, पीछे, फिर से, और आसान, विस्तार से, मूल, तेज़, धीरे, मैं कहाँ हूँ, किसी शब्द का मतलब, या होम।";
const CMD_LIST = "You can say: pause, play, next, back, repeat, simpler, more detail, original, faster, slower, where am I, what does a word mean, read screen, stop listening, or home.";
/** Beep, then listen for about 3 seconds. Returns a recognised command, or null (then reading simply carries on). */
async function hearCommand(run) {
  await sleep(250);                                       // let the voice finish so I do not hear myself
  if (run !== state.run) return null;
  earcon("listen");
  toast(T("🎤 Listening… say pause, simpler, more detail or original", "🎤 सुन रहा हूँ… रुको, और आसान, विस्तार से या मूल बोलें"));
  const r = await listenOnce({ maxMs: 3500 });
  toast("");
  if (run !== state.run) return null;
  if (!r?.transcript) {
    const why = audio.lastVoiceError;
    if (why === "not-allowed" || why === "service-not-allowed") {
      state.hearBetween = false;
      toast("The microphone is blocked. Allow it in the browser settings, then reload.", 6000);
      say("I cannot hear commands because the microphone is blocked. Use the buttons, or allow the microphone and reload the page.");
    } else if (why && why !== "no-speech" && why !== "aborted") toast(`Microphone problem: ${why}`, 3500);
    return null;
  }
  if (!r.cmd) { toast(`Heard “${r.transcript}”: not a command`, 1800); return null; }
  toast(`${T("Heard", "सुना")}: “${r.transcript}”`, 1500);
  return r;
}

async function finish() {
  earcon("end");
  $("end").hidden = false;
  $("end").scrollIntoView({ block: "nearest", behavior: "smooth" });
  await say(T("That was the whole text. Was it clear? Say yes or no, or press a button. Or say simpler to hear it again, more simply.",
    "पूरा पाठ हो गया। क्या समझ आया? हाँ या नहीं बोलें। और आसान सुनना हो तो और आसान बोलें।"));
  askEnd();
}
async function askEnd(attempt = 0) {
  if (!state.voiceUI || !voiceSupported || state.view !== "read" || $("end").hidden) return;
  const my = ++state.listenToken;
  toast(T("🎤 Listening… say yes or no", "🎤 सुन रहा हूँ… हाँ या नहीं बोलें"));
  const r = await listenOnce();
  toast("");
  if (my !== state.listenToken || state.view !== "read" || $("end").hidden) return;
  const t = (r?.transcript || "").toLowerCase();
  if (/\b(no|not|simpler|easier|again)\b/.test(t) || /नहीं|नही|ना|आसान|फिर से|दोबारा/.test(t)) return $("b-no").click();
  if (/\b(yes|yeah|clear|good|fine|ok|okay)\b/.test(t) || /हाँ|हां|जी|ठीक|समझ आया|समझ गया|समझ गई/.test(t)) return $("b-yes").click();
  if (/\b(home|new|another)\b/.test(t)) return goHome();
  if (attempt < 1) { await say(T("Please say yes or no.", "कृपया हाँ या नहीं बोलें।")); return askEnd(attempt + 1); }
}

function setLevel(l) {
  if (l < 0 || l > 3) { const m = l > 3 ? T("This is already the simplest level.", "यह सबसे आसान स्तर है।") : T("This is already the original wording.", "यह पहले से मूल शब्द हैं।"); toast(m, 2200); say(m); return; }
  const was = state.playing;
  state.level = l;
  paintLevels(); render();
  // Say the new level first (so you know it changed), then re-read the same sentence.
  const my = ++state.run;
  stopSpeaking(); state.playing = false;
  say(`${levelName(l)}.`).then(() => { if (my === state.run) playFrom(state.idx, { once: !was }); });
}

// ---------- explain a word ----------
async function explainWord(word) {
  word = word.trim();
  if (!word) return;
  state.resumeAfterSheet = state.playing;
  pause();
  const g = state.doc.glossary || {};
  const lw = word.toLowerCase();
  const key = Object.keys(g).find(t => t.toLowerCase() === lw) || Object.keys(g).find(t => t.toLowerCase().includes(lw) || lw.includes(t.toLowerCase()));
  let text = key ? g[key] : "";
  const shown = key || word;
  $("sheet-word").textContent = shown;
  $("sheet-text").textContent = text || T("Looking it up…", "ढूँढ रहा हूँ…");
  $("sheet").hidden = false;
  if (!text) {
    try {
      const res = await (await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: word, lang: state.doc.lang || "en", context: state.doc.sentences[state.idx].original }) })).json();
      text = res.explanation || "";
    } catch { /* fall through */ }
    if (!text) text = T("Sorry, I do not have an explanation for that word right now.", "माफ़ कीजिए, अभी इस शब्द का मतलब नहीं मिल पाया।");
    $("sheet-text").textContent = text;
  }
  $("sheet-close").focus();                                // screen readers land on the Close button
  const how = state.lang === "hi"
    ? (state.blind ? " बंद करने के लिए दो उंगलियों से नीचे स्वाइप करें, या दो बार टैप करें।" : " बंद करने के लिए नीचे का बटन दबाएँ।")
    : state.blind ? " To close, swipe down with two fingers, or double tap."
    : state.voiceUI ? " To close, press Close and keep reading, at the bottom of the screen." + (state.always ? " Or say close." : "")
    : " Close button below.";
  $("sheet-text").lang = state.doc.lang === "hi" ? "hi" : "en";
  if (state.doc.lang === "hi" && state.voiceUI) {
    say(`${shown}.`).then(ok => ok && speak(text, { lang: HI })).then(ok => ok && say(how.trim()));
  } else say(`${shown}. ${text}.${how}`);
}
function closeSheet() {
  $("sheet").hidden = true;
  stopSpeaking();
  const resume = state.resumeAfterSheet;
  state.resumeAfterSheet = false;
  if (state.view === "read") { if (resume) playFrom(state.idx); else say(T("Closed. Paused at the same sentence.", "बंद किया। उसी जगह रुका हुआ है।")); }
}
$("sheet-close").addEventListener("click", closeSheet);

// ---------- buttons ----------
$("b-yes").addEventListener("click", () => { state.listenToken++; stopListening(); $("end").hidden = true; toast("👍", 2000); say(T("Great. Press Add different text at the top to start again, or pick another level.", "बहुत अच्छा। नया टेक्स्ट लाने के लिए ऊपर का बटन दबाएँ, या कोई और स्तर चुनें।")); });
$("b-no").addEventListener("click", () => {
  state.listenToken++; stopListening();
  $("end").hidden = true;
  if (state.level < 3) {
    state.level++; paintLevels(); render();
    const m = T(`Starting again at ${LEVELS[state.level].name}.`, `फिर से शुरू, ${levelName(state.level)} में।`);
    toast(m, 2500);
    say(m).then(() => playFrom(0));
  } else { say(T("This is already the simplest level. Say, what does, then a word, mean, for any hard word.", "यह सबसे आसान स्तर है। किसी शब्द का मतलब पूछने के लिए बोलें: इस शब्द का मतलब क्या है।")); playFrom(0); }
});
$("levels").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { unlockSpeech(); setLevel(Number(b.dataset.level)); } });
$("show-orig").addEventListener("change", render);
$("sents").addEventListener("click", e => {
  const u = e.target.closest("u");
  if (u) return explainWord(u.dataset.term);
  const el = e.target.closest(".sent");
  if (el) { unlockSpeech(); playFrom(Number(el.dataset.i)); }
});
$("sents").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("sent")) { e.preventDefault(); playFrom(Number(e.target.dataset.i)); } });

$("p-play").addEventListener("click", () => { unlockSpeech(); if (state.playing) return pause(); playFrom(!$("end").hidden ? 0 : state.idx); });
$("p-next").addEventListener("click", () => { unlockSpeech(); playFrom(state.idx + 1, { once: !state.playing }); });
$("p-back").addEventListener("click", () => { unlockSpeech(); playFrom(state.idx - 1, { once: !state.playing }); });
function setRate(d) {
  settings.rate = Math.round(Math.max(0.6, Math.min(1.8, settings.rate + d)) * 10) / 10;
  try { localStorage.setItem("ss.rate", settings.rate); } catch { /* ignore */ }
  updateUI(); toast(`${T("Speed", "गति")} ${settings.rate.toFixed(1)}×`, 1200);
  if (state.playing) playFrom(state.idx); else say(`${T("Speed", "गति")} ${settings.rate.toFixed(1)}`);
}
$("p-slow").addEventListener("click", () => { unlockSpeech(); setRate(-0.1); });
$("p-fast").addEventListener("click", () => { unlockSpeech(); setRate(0.1); });

function goHome() {
  pause(); $("sheet").hidden = true; $("help").hidden = true;
  show("input");
  readScreen();
}
$("b-new").addEventListener("click", () => { unlockSpeech(); goHome(); });
$("b-home").addEventListener("click", () => { unlockSpeech(); goHome(); });

function openHelp() {
  unlockSpeech();
  if (state.view === "read") pause();
  $("help").hidden = false;
  say(T(HELP_SPOKEN, HELP_SPOKEN_HI));
}
$("b-help").addEventListener("click", openHelp);
$("help-close").addEventListener("click", () => { $("help").hidden = true; stopSpeaking(); });

// ---------- voice commands while reading ----------
async function mic() {
  if (!voiceSupported) { toast("Voice commands need Chrome (Android) or Safari (iPhone).", 4000); return say("Voice commands need Chrome or Safari. Use the buttons instead."); }
  unlockSpeech();
  const was = state.playing;
  pause();
  $("p-mic").classList.add("on");
  toast(T("🎤 Listening… say a command", "🎤 सुन रहा हूँ… बोलिए"));
  earcon("listen");
  const r = await listenOnce();
  $("p-mic").classList.remove("on");
  if (!r?.transcript) {
    const why = audio.lastVoiceError;
    const m = why === "not-allowed" || why === "service-not-allowed" ? T("The microphone is blocked. Allow it for this page in the browser settings.", "माइक बंद है। ब्राउज़र की सेटिंग में इस पेज के लिए माइक चालू करें।")
      : why === "network" ? T("Voice commands need an internet connection.", "बोलकर कमांड देने के लिए इंटरनेट चाहिए।")
      : T("I did not hear anything. Press the microphone and speak.", "मुझे कुछ सुनाई नहीं दिया। माइक दबाकर बोलें।");
    toast(m, 4500);
    return say(m);
  }
  toast(`${T("Heard", "सुना")}: “${r.transcript}”`, 2500);
  runCommand(r, was);
  setTimeout(ensureAlways, 700);
}
$("p-mic").addEventListener("click", mic);

function runCommand(r, was) {
  const idx = state.idx, t = r.transcript.toLowerCase();
  if (/\bread (the )?screen\b/.test(t)) return say(SCRIPTS.read());
  if (/\b(always listen|always listening|headphones|hands free|hands-free)\b/.test(t)) return setAlways(true);
  if (/\b(stop listening|do not listen|don't listen|stop asking|no more listening)\b/.test(t)) {
    if (state.always) { state.always = false; $("always").checked = false; stopListening(); }
    state.hearBetween = false;
    const run = ++state.run;
    return say("Okay, I will not listen between sentences. Press the microphone, or swipe up with two fingers, when you want to speak.")
      .then(() => { if (was && run === state.run) playFrom(idx); });
  }
  if (/\b(start listening|listen between|keep listening|listen after each sentence)\b/.test(t)) {
    state.hearBetween = true;
    const run = ++state.run;
    return say("Okay, I will beep and listen after each sentence.").then(() => { if (was && run === state.run) playFrom(idx); });
  }
  switch (r.cmd) {
    case "next": return playFrom(idx + 1, { once: !was });
    case "back": return playFrom(idx - 1, { once: !was });
    case "repeat": return playFrom(idx, { once: !was });
    case "play": case "choose": return playFrom(idx);
    case "yes": if (!$("end").hidden) return $("b-yes").click(); return playFrom(idx);
    case "no": if (!$("end").hidden) return $("b-no").click(); return;
    case "pause":
      if (!$("sheet").hidden) return closeSheet();                   // "stop" / "बंद करो" while an explanation is open closes it
      state.run++; state.playing = false; updateUI(); return say(T("Paused.", "रोक दिया।"));
    case "simpler": return setLevel(state.level + 1);
    case "detail": return setLevel(state.level - 1);
    case "original": {
      const run = ++state.run;
      state.playing = false; updateUI();
      return say(T("Original wording.", "मूल शब्द।")).then(ok => ok && say(state.doc.sentences[idx].original)).then(ok => {
        if (ok && run === state.run && was) { if (idx < n() - 1) playFrom(idx + 1); else finish(); }   // then carry on reading
      });
    }
    case "explain": {
      if (r.arg) return explainWord(r.arg);
      const first = Object.keys(state.doc.glossary || {}).find(w => new RegExp(`(?<![\\w-])${reg(w)}(?![\\w-])`, "i").test(state.doc.sentences[idx].original));
      return first ? explainWord(first) : say(T("There are no hard words in this part. Say, what does, then any word, mean.", "इस हिस्से में कोई कठिन शब्द नहीं है। किसी भी शब्द के लिए बोलें: इसका मतलब क्या है।"));
    }
    case "faster": return setRate(0.1);
    case "slower": return setRate(-0.1);
    case "where": return say(T(`Part ${idx + 1} of ${n()}. Level ${LEVELS[state.level].name}. ${was ? "Playing." : "Paused."}`,
      `${n()} में से हिस्सा ${idx + 1}। स्तर ${levelName(state.level)}। ${was ? "पढ़ रहा था।" : "रुका हुआ है।"}`));
    case "close":
      if (!$("sheet").hidden) return closeSheet();
      if (!$("help").hidden) { $("help").hidden = true; return say("Help closed."); }
      return was ? playFrom(idx) : say("Nothing to close.");
    case "home": return goHome();
    case "help": return /what can i say|commands?|options?|क्या बोल|कमांड/.test(t) ? say(T(CMD_LIST, CMD_LIST_HI)) : openHelp();
    default: { const m = T("That is not a command. " + CMD_LIST, "यह कमांड नहीं है। " + CMD_LIST_HI); toast(m, 4500); return say(m); }
  }
}

// ---------- test the loudspeaker ----------
$("b-test").addEventListener("click", () => {
  unlockSpeech();
  earcon("success");
  speak("Hello. SimpliSpeak is speaking through your phone speaker. If you can hear this, everything is working.")
    .then(ok => { if (!ok) $("voice-banner").hidden = false; });
});

// ---------- phones that block speech ----------
hooks.onSpeechProblem = () => { if (state.voiceUI) $("voice-banner").hidden = false; };
hooks.onSpeechStart = () => { $("voice-banner").hidden = true; };
$("voice-banner").addEventListener("click", () => {
  unlockSpeech();
  $("voice-banner").hidden = true;
  speak("Voice is on.").then(() => readScreen());
});

applyLang();
checkStatus();
loadSamples();
show("input");
$("w-start").focus();
