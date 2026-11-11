# B. Compromises in prototyping (horizontal and vertical)

A **horizontal** prototype shows the breadth of features with shallow depth. A **vertical**
prototype implements a few features fully, end to end. SimpliSpeak Phase 2 is a deliberate
"T": broad across all 11 Phase-1 screens, and deep in the core task (hard text → clear audio).

## Vertical slice (fully working, end to end)

| Feature | What actually works |
|---|---|
| Simplification | Real AI (Claude) produces Light / Simple / Very simple for every sentence of any text; offline rule-based fallback |
| Protected-facts guard | Automatic check of numbers and warnings on every level; unsure parts fall back to the original with a caution earcon |
| Listen loop | Sentence parts, auto-advance, play/pause, next/back/repeat, level change in place, original on demand |
| Word help | Glossary from the AI, cycled by long press or E; any word via voice ("what does hepatic mean") or typed |
| Four input modalities | Buttons, gestures (swipe, double tap, long press, two-finger tap), keyboard, voice commands |
| Feedback loop | "Was it clear?" → No restarts one level simpler |
| Clipboard paste | Real clipboard read with word-count confirmation |
| Scan | Live camera with audio guidance (too dark / hold still / no text) and real OCR (Tesseract.js) |
| Study instrumentation | Every action logged with time, modality, part and level; comprehension questions, NASA-TLX, SUS, preferences, export, analysis script |

## Horizontal (present but shallow)

| Feature | Compromise | Why acceptable |
|---|---|---|
| Settings | Speed, voice, language, start level, pause-after-part, earcons, display. No user accounts or sync | Covers what tests need |
| Samples | 3 test texts + 1 practice text with **hand-written** levels | Controlled stimuli: every participant hears identical wording, so results reflect the interaction rather than AI variability |
| Scan guidance | Brightness, motion and "text present" from frame statistics; no page-edge or skew detection | Enough to get a readable photo; edge detection is a computer-vision project of its own |
| Hands-free voice | Continuous recognition works but can hear its own speech without headphones | Push-to-talk is the default; hands-free is marked "use headphones" |
| Install | Web manifest only (add to home screen), no offline service worker | Needs the server for AI anyway |

## Not built (out of scope, stated honestly)

- Share sheet, email and file integrations (slide 12: "too complex for our timeline").
- Native screen-reader integration (TalkBack/VoiceOver custom actions). A web page cannot receive
  raw gestures while a screen reader is on, so screen reader mode uses ordered, labelled buttons and
  hands the text to the screen reader. In that mode, parts advance with Next, not automatically.
- Braille output, languages other than English, PDF upload.
- A confidence score from the AI itself. We use a rule-based guard instead (see below).

## Fidelity trade-offs we chose on purpose

1. **Precompute all levels once per document** rather than simplify live on each "simpler"
   command. Costs one wait of a few seconds at the start, but every level change is instant.
   Waiting mid-sentence would break the listening flow.
2. **Hand-written levels for study texts, AI for everything else.** This separates two questions:
   *does the interaction help?* (controlled study) and *can AI produce the levels?* (live demo).
3. **Rule-based guard instead of a second AI check.** It is fast and predictable, and it can be
   explained in the viva. It catches lost numbers and lost negations but not subtler meaning
   changes; we list this as a limitation.
4. **Web Speech API voices** vary by browser and OS. Chrome or Edge on Android or Windows
   recommended. Natural-sounding voices are available in Edge.
5. **NASA-TLX on a 7-point scale** (mapped to 0–100) instead of the 21-point original, so it can
   be answered with one key press by audio. Raw TLX (no pairwise weighting) is standard practice
   (Hart, 2006).
6. **Sighted blindfolded participants** may be used to fill numbers if blind participants are
   few. Results from them are reported separately, because they are not experienced screen-reader
   users.

## Changes from the Phase 1 proposal

| Phase 1 (slides) | Phase 2 (built) | Reason |
|---|---|---|
| Repeat had no gesture | Tap = repeat; two-finger tap = original; two-finger swipe up = voice; two-finger swipe down = menu | Completes the gesture set |
| Gestures on one pad; buttons for menus | **Audio mode**: the whole screen is the gesture surface and every screen is a spoken list. **Screen reader mode**: labelled buttons, text read by the user's own screen reader | Design review: blind users cannot find on-screen buttons, and TalkBack captures swipes |
| Scan needs a Capture button | Auto-capture when the page is steady, with spoken guidance | No need to find a button |
| AI provider unspecified | Gemini (`gemini-3.5-flash`, about 10 s per document) with offline fallback | Available key; fast; structured JSON output |
| "Honest limits: planned for the real app" | Implemented as the protected-facts guard + caution earcon | Trust is a design requirement |
| Simplified text written by hand for 3 samples | Real AI simplification of any text; hand-written kept for the study | Moves from Wizard-of-Oz to working system |
| Voice commands always on | Push-to-talk by default (button / V), hands-free optional | TTS was triggering the recogniser (echo) |
| Test plan: participants TBD, no comparison | Within-subjects Baseline vs SimpliSpeak, counterbalanced | Gives a measurable outcome |
