// Speech output (Web Speech synthesis), voice input (Web Speech recognition) and earcons.

export const settings = {
  mode: null,            // "audio" (gestures + app voice) or "reader" (TalkBack / VoiceOver)
  appVoice: false,       // reader mode: read text with the app voice instead of the screen reader
  rate: 1.0, voiceURI: "", lang: "en-IN", earcons: true, startLevel: 2,
  pauseEach: false, handsFree: false, showText: true, large: false, contrast: false,
  hintsHeard: 0,         // gesture hints are spoken for the first few menus only
};

// ---------- Earcons: short non-speech sounds that replace extra words ----------
let ctx;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
function tone(freq, start, dur, { type = "sine", gain = 0.18 } = {}) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const EARCONS = {
  part:     () => tone(880, 0, 0.05, { gain: 0.08 }),
  simpler:  () => { tone(523, 0, 0.09); tone(784, 0.09, 0.14); },
  detail:   () => { tone(784, 0, 0.09); tone(523, 0.09, 0.14); },
  limit:    () => tone(150, 0, 0.2, { type: "square", gain: 0.08 }),
  original: () => { tone(440, 0, 0.25, { type: "triangle" }); tone(660, 0, 0.25, { type: "triangle", gain: 0.1 }); },
  explain:  () => tone(1320, 0, 0.3, { gain: 0.1 }),
  listen:   () => tone(1000, 0, 0.08),
  heard:    () => tone(700, 0, 0.08),
  unsure:   () => { tone(330, 0, 0.08, { type: "square", gain: 0.07 }); tone(330, 0.14, 0.08, { type: "square", gain: 0.07 }); },
  end:      () => { tone(523, 0, 0.12); tone(659, 0.12, 0.12); tone(784, 0.24, 0.25); },
  success:  () => { tone(600, 0, 0.08); tone(900, 0.08, 0.12); },
  error:    () => tone(200, 0, 0.25, { type: "sawtooth", gain: 0.06 }),
  tick:     () => tone(1200, 0, 0.02, { gain: 0.05 }),
};
export function earcon(name) {
  if (!settings.earcons || !EARCONS[name]) return;
  try { EARCONS[name](); } catch { /* audio blocked until first user gesture */ }
}

// ---------- Speech synthesis ----------
const synth = window.speechSynthesis;
let voices = [];
let token = 0;
export function loadVoices() {
  voices = synth ? synth.getVoices().filter(v => v.lang.toLowerCase().startsWith("en")) : [];
  return voices;
}
if (synth) synth.onvoiceschanged = loadVoices;

function pickVoice() {
  if (!voices.length) loadVoices();
  return voices.find(v => v.voiceURI === settings.voiceURI)
    || voices.find(v => v.lang === settings.lang)
    || voices.find(v => /natural|online|google/i.test(v.name))
    || voices[0];
}

const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const speechLang = () => (/^en/i.test(navigator.language || "") ? navigator.language : "en-US");
let unlocked = false;
export const hooks = { onSpeechProblem: null, onSpeechStart: null };

/** Phones only allow speech after a tap. Call this straight from a tap handler (no await before it). */
/** Make the phone treat us as a media player: output goes to the loudspeaker, and on iPhone the silent switch is ignored. */
let keepAliveAudio = null;
function useSpeaker() {
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* not supported */ }
  if (keepAliveAudio) return;
  try {
    // A silent, looping sound switches the page to the "playback" audio category on iOS and keeps Android on media volume.
    const n = 8000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, "data"); v.setUint32(40, n, true); new Uint8Array(buf, 44).fill(128);
    keepAliveAudio = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
    keepAliveAudio.loop = true; keepAliveAudio.volume = 0.01;
    keepAliveAudio.play().catch(() => { keepAliveAudio = null; });
  } catch { keepAliveAudio = null; }
}

export function unlockSpeech() {
  useSpeaker();
  if (!synth || unlocked) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance("ok");
    u.volume = 0;
    synth.speak(u);
  } catch { unlocked = false; }
}

/** Speak text. Resolves true when finished, false if interrupted by a newer speak/stop (or if the phone blocked speech). */
/** An installed voice for a language ("hi-IN"), if the phone has one. */
function voiceFor(lang) {
  const want = lang.slice(0, 2).toLowerCase();
  const all = synth ? synth.getVoices() : [];
  const ok = all.filter(v => v.lang.toLowerCase().replace("_", "-").startsWith(want));
  return ok.find(v => v.localService) || ok[0] || null;
}

export function speak(text, { rate, lang } = {}) {
  if (!synth || !text) return Promise.resolve(true);
  const my = ++token;
  const busy = synth.speaking || synth.pending;
  synth.cancel();
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text.replace(/₹\s?/g, lang && lang.startsWith("hi") ? "रुपये " : "rupees "));
    // Only force a voice if the listener chose one. Forcing a voice the phone has not downloaded is
    // the usual reason for total silence on Android.
    const v = lang ? voiceFor(lang) : (settings.voiceURI ? pickVoice() : null);
    u.lang = lang || (v ? v.lang : speechLang());
    if (v) u.voice = v;
    u.rate = rate ?? settings.rate;
    u.volume = 1;
    u.pitch = 1;
    let done = false, started = false, startWatch, endWatch, keepAlive;
    const finish = ok => {
      if (done) return;
      done = true; clearTimeout(startWatch); clearTimeout(endWatch); clearInterval(keepAlive);
      resolve(ok && my === token);
    };
    u.onstart = () => {
      started = true; clearTimeout(startWatch); hooks.onSpeechStart?.();
      // If the engine never reports the end, do not leave the app waiting forever.
      endWatch = setTimeout(() => finish(true), 8000 + (text.length * 130) / Math.max(0.5, u.rate));
    };
    u.onend = () => finish(true);
    u.onerror = e => {
      if (e && (e.error === "interrupted" || e.error === "canceled")) return finish(false);
      if (!started && e && e.error === "not-allowed") hooks.onSpeechProblem?.();
      finish(false);
    };
    // Chrome on a computer stops long utterances after ~15 s unless nudged. Pause/resume breaks Android.
    if (!MOBILE) keepAlive = setInterval(() => { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } }, 10000);
    // The phone never started speaking: tell the app so it can offer a "tap to turn on voice" button.
    startWatch = setTimeout(() => { if (!started && my === token) { hooks.onSpeechProblem?.(); finish(false); } }, 6000);
    const go = () => { if (my === token) synth.speak(u); else finish(false); };
    if (busy && !MOBILE) setTimeout(go, 40); else go();     // speak inside the tap whenever possible
  });
}
export function stopSpeaking() { token++; synth && synth.cancel(); }
export function isSpeaking() { return !!synth && synth.speaking; }
export const ttsSupported = !!synth;

// ---------- Voice commands ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;

const COMMANDS = [
  [/\b(not clear|nope|not really|no)\b/, "no"],
  [/\b(yes|yeah|yep|clear|got it)\b/, "yes"],
  [/\b(what can i say|commands?|options?)\b/, "help"],
  [/\b(close|dismiss|done|back to reading|keep reading)\b/, "close"],
  [/\b(menu|main menu)\b/, "home"],
  [/\b(what does|what is|what's|explain|meaning of|define)\b\s*(.*)/, "explain"],
  [/\bmean(s|ing)?\b/, "explain"],
  [/\b(more details?|more detailed|details?|detailed|harder|less simple|longer|expand|full version|complex|complicated|normal)\b/, "detail"],
  [/\b(simpler|simplest|easier|easy|simple|simplify|shorter|too hard|too difficult|make it simple|dumb it down)\b/, "simpler"],
  [/\b(original|exact|as written|actual text|real text|first version|source)\b/, "original"],
  [/\b(pause|stop|wait|hold on|hold|quiet|silence|enough)\b/, "pause"],
  [/\b(back|previous|go back|before|last one)\b/, "back"],
  [/\b(next|forward|skip|following|move on)\b/, "next"],
  [/\b(play|resume|continue|start|read|go on|go ahead|carry on)\b/, "play"],
  [/\b(repeat|again|say that|pardon|sorry|once more)\b/, "repeat"],
  [/\b(faster|speed up|quicker)\b/, "faster"],
  [/\b(slower|slow down)\b/, "slower"],
  [/\b(where am i|where|position|which part|how far)\b/, "where"],
  [/\bhelp\b/, "help"],
  [/\b(choose|select|open|okay|ok|this one)\b/, "choose"],
  [/\b(home|exit|quit)\b/, "home"],
];

// Hindi commands, as a Hindi speech recogniser writes them (Devanagari). Checked first for Devanagari text.
const HI_COMMANDS = [
  [/(का मतलब|का अर्थ|मतलब क्या|मतलब|अर्थ|समझाओ|समझाइए|क्या होता है)/, "explain"],
  [/(सबसे आसान|और आसान|आसान|सरल|सिंपल)/, "simpler"],
  [/(विस्तार|ज़्यादा जानकारी|ज्यादा जानकारी|और जानकारी|पूरी बात|डिटेल)/, "detail"],
  [/(मूल|असली|जैसा लिखा|ओरिजिनल)/, "original"],
  [/(क्या बोल|कमांड|मदद|सहायता|हेल्प)/, "help"],
  [/(रुको|रुकिए|रुक जाओ|रोको|रोकिए|रोक दो|ठहरो|पॉज़|पॉज|स्टॉप|बंद)/, "pause"],
  [/(फिर से|दोबारा|दुबारा|दोहराओ|दोहराइए|एक बार और|रिपीट)/, "repeat"],
  [/(अगला|अगली|आगे|नेक्स्ट)/, "next"],
  [/(पिछला|पिछली|पीछे|वापस|बैक)/, "back"],
  [/(चलाओ|चलाइए|शुरू करो|शुरू|पढ़ो|पढ़िए|जारी रखो|प्ले)/, "play"],
  [/(तेज़|तेज|जल्दी|फास्ट)/, "faster"],
  [/(धीरे|धीमा|धीमे|स्लो)/, "slower"],
  [/(कहाँ|कहां|कौन सा हिस्सा)/, "where"],
  [/(होम|शुरुआत|मुख्य पेज)/, "home"],
  [/(^|\s)(हाँ|हां|जी|ठीक है|हाँ जी)(\s|$|।)/, "yes"],
  [/(^|\s)(नहीं|नही|ना)(\s|$|।)/, "no"],
];
// Hindi said in Latin letters (Hinglish), in case the recogniser writes it that way.
const ROMAN_HI = [
  [/\b(matlab|arth|samjhao)\b/, "explain"],
  [/\b(aasaan|asaan|aasan|saral)\b/, "simpler"],
  [/\b(vistaar|vistar)\b/, "detail"],
  [/\b(ruko|roko|rukiye|rukiyе|band karo|thehro)\b/, "pause"],
  [/\b(phir se|dobara|dubara)\b/, "repeat"],
  [/\b(aage|agla|agli)\b/, "next"],
  [/\b(peeche|piche|pichla|wapas|vapas)\b/, "back"],
  [/\b(chalao|padho|shuru)\b/, "play"],
  [/\b(tez|jaldi)\b/, "faster"],
  [/\b(dheere|dhire|dheema)\b/, "slower"],
  [/\b(madad)\b/, "help"],
];

export function parseCommand(transcript) {
  const raw = (transcript || "").replace(/[?।]/g, " ").trim();
  if (/[\u0900-\u097F]/.test(raw)) {
    for (const [re, cmd] of HI_COMMANDS) {
      if (re.test(raw)) {
        const arg = cmd !== "explain" ? "" : raw
          .replace(/(का मतलब|का अर्थ|मतलब|अर्थ|क्या होता है|क्या हैं|क्या है|समझाओ|समझाइए|बताओ|बताइए|शब्द|क्या)/g, " ")
          .replace(/\s+/g, " ").trim();
        return { cmd, arg, transcript };
      }
    }
  }
  const t = transcript.toLowerCase().replace(/[.,!?]/g, " ").trim();
  for (const [re, cmd] of COMMANDS) {
    const m = t.match(re);
    if (m) {
      let arg = "";
      if (cmd === "explain") {
        arg = (m[2] || t.replace(/\b(what does|what is|what's|explain|mean(s|ing)?|meaning of|define|the word)\b/g, ""))
          .replace(/\b(mean|means|the word|word|please)\b/g, "").trim();
      }
      return { cmd, arg, transcript };
    }
  }
  for (const [re, cmd] of ROMAN_HI) if (re.test(t)) return { cmd, arg: "", transcript };
  return { cmd: null, arg: "", transcript };
}

let rec = null, recActive = false, continuousWanted = false;
export let lastVoiceError = "";

/** Listen for one command (push to talk). Resolves {cmd, arg, transcript} or null. */
export function listenOnce({ maxMs = 0 } = {}) {      // maxMs: a short listening window (stops by itself)
  if (!SR) return Promise.resolve(null);
  stopListening();
  return new Promise(resolve => {
    const r = new SR();
    r.lang = settings.lang; r.interimResults = false; r.maxAlternatives = 3; r.continuous = false;
    let settled = false;
    const done = v => { if (!settled) { settled = true; recActive = false; resolve(v); } };
    r.onresult = e => {
      const alts = [...e.results[0]].map(a => a.transcript);
      const parsed = alts.map(parseCommand).find(p => p.cmd) || parseCommand(alts[0] || "");
      done(parsed);
    };
    lastVoiceError = "";
    r.onerror = e => { lastVoiceError = e?.error || "error"; done(null); };
    r.onend = () => done(null);
    rec = r; recActive = true;
    try { r.start(); } catch { lastVoiceError = "error"; done(null); }
    if (maxMs) setTimeout(() => { try { r.stop(); } catch { /* already stopped */ } }, maxMs);
  });
}

/** Hands-free: keep listening and call onCommand for each final phrase. */
export function startContinuous(onCommand) {
  if (!SR) return false;
  continuousWanted = true;
  const run = () => {
    if (!continuousWanted) return;
    const r = new SR();
    r.lang = settings.lang; r.continuous = true; r.interimResults = false;
    r.onresult = e => {
      const res = e.results[e.results.length - 1];
      if (res.isFinal) onCommand(parseCommand(res[0].transcript));
    };
    r.onend = () => { recActive = false; if (continuousWanted) setTimeout(run, 250); };
    r.onerror = ev => { if (ev.error === "not-allowed") continuousWanted = false; };
    rec = r; recActive = true;
    try { r.start(); } catch { /* already started */ }
  };
  run();
  return true;
}

export const isContinuous = () => continuousWanted;

export function stopListening() {
  continuousWanted = false;
  if (rec && recActive) { try { rec.abort(); } catch { /* ignore */ } }
  recActive = false;
}
