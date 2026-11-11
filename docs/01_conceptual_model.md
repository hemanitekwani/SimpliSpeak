# C. Conceptual model

## 1. Metaphor: "a patient friend reading your letter aloud"

When a blind person gets a hard letter today, they often ask a sighted helper to read it.
A good helper does four things, and SimpliSpeak maps each one to a control:

| A good human helper… | SimpliSpeak |
|---|---|
| reads one bit at a time and waits | **Short parts**: one sentence per part, with next / back / repeat |
| "let me say that more simply" | **Simpler / More detail**: a level the listener sets, like a volume knob |
| "*hepatic* means liver" | **Explain**: word help only when asked |
| "here is exactly what it says" | **Original**: the exact source text, one command away |

A second, supporting metaphor is the **simplicity dial**. Like volume, it is continuous in the
listener's mind (four steps: Original → Light → Simple → Very simple), always adjustable while
listening, and it never moves your place in the text. Up means simpler, down means more detail:
the same direction in every modality (swipe, arrow key, voice word, button order).

The key design stance from Phase 1 is kept: **the listener, not the AI, decides how simple the
text should be.**

## 2. No sight assumed: two interaction modes

A blind user cannot "tap the Capture button": they would first have to find it. And when TalkBack
or VoiceOver is on, the screen reader takes every swipe for its own navigation, so a web app cannot
receive them. SimpliSpeak therefore has two complete modes:

| | Audio mode | Screen reader mode |
|---|---|---|
| Mental model | "The whole screen is the remote control." | "A short, ordered list of buttons." |
| Output | App voice + earcons | The user's own screen reader (their voice, their speed) via a live region; earcons kept |
| Input | Gestures anywhere, voice, keyboard | Screen-reader navigation of labelled buttons, voice, keyboard |
| Navigation rule | Every screen is a **spoken list**: swipe right/left to hear options, double tap anywhere to choose | Swipe to the button, double tap (the screen reader's own rule) |

**One rule everywhere.** Home, samples, levels, settings, "Was it clear?", and even the study's
questions and ratings are the same spoken list, so learning one gesture set is enough. The audio-mode
list deliberately copies the screen-reader convention (swipe = next, double tap = activate), so
skills transfer in both directions.

**Instructions never point at the screen.** Prompts name *gestures* ("double tap anywhere") or
*options* ("choose Scan paper"), never positions ("the button at the top"). The camera captures by
itself when the page is steady, so scanning needs no button at all.

**Choosing the mode without sight.** The start screen is a single full-screen button. A finger tap
(touch events) selects audio mode; a screen reader's double tap or the Enter key (no touch events)
selects screen reader mode. A hidden "Use screen reader mode" button is the first thing a
screen reader finds in audio mode, and Settings can switch either way.

## 3. Objects and actions (the user's mental model)

- **Document**: what you brought in (pasted, scanned, typed or a sample).
- **Part**: one sentence of the document. It is the unit of navigation.
- **Level**: how the parts are worded. There is one level for the whole document, so it is sticky.
- **Hard word**: a term from the original that has an explanation.
- **Position**: "Part 3 of 8, Simple". You can ask for it any time ("where am I" by voice, or W).

| Action | Effect on position | Effect on level |
|---|---|---|
| Next / Back / Repeat | moves / stays | unchanged |
| Simpler / More detail | **unchanged** (same part re-read) | ±1 |
| Explain | unchanged (part replays after) | unchanged |
| Original | unchanged | unchanged (one-off) |
| "Not clear" at the end | back to part 1 | +1 (one level simpler) |

Invariant that users can rely on: **changing how something is said never changes where you are.**

## 4. Interaction flow

```
Bring text in ──► Choose level (hear previews) ──► Listen part by part ◄──┐
 (paste / scan /                                      │  adjust: simpler,  │
  type / sample)                                      │  detail, explain,  │
                                                      │  original, repeat ─┘
                                                      ▼
                                           "Was it clear?"  ── No ──► restart, one level simpler
                                                      │ Yes
                                                      ▼
                                                    Done
```
Nothing in the flow requires sight. Every step is announced by speech, and state changes have a
short **earcon** (sound cue) so experienced users can run at 1.5–1.8× speed with fewer words:

| Earcon | Meaning |
|---|---|
| short click | a new part starts |
| rising two notes / falling two notes | simpler / more detail |
| low buzz | limit reached (first part, last part, simplest level) |
| soft chord | original text follows |
| bell | word explanation follows |
| double low beep | **caution**: this simplified part may have lost a fact, so the original is read |
| three rising notes | end of document |

## 5. Trust model (protected facts)

For health and money, a wrong simplification is worse than none. The trust model has three layers:
1. **Generation rules**: the AI must keep every number, date, dose, amount and warning, and never add advice.
2. **Automatic guard** (`simplispeak/guard.py`): every simplified part is checked against its original.
   If a number disappears or a prohibition ("do not", "never", "stop") is lost, the part is marked
   *unsure*.
3. **Honest fallback**: for an unsure part, the listener hears a caution earcon and *"the simpler
   version may have lost a detail; here is the original"*. The original is also always available.

## 6. Design space

The table shows the dimensions we explored and where SimpliSpeak sits (●). Alternatives (○) were
considered and rejected or deferred, with the reason.

| Dimension | Options | Choice and reason |
|---|---|---|
| Who controls simplification | ○ AI decides automatically · ● listener chooses level · ○ fixed single version | Listener control keeps dignity ("not talked down to", Asha) and lets Ravi go simpler |
| Granularity of control | ○ whole document · ● per document with instant per-part re-read · ○ per word | Per-part re-read keeps place; per-word is too fine to steer by ear |
| Number of levels | ○ 2 · ● 4 · ○ continuous slider | 4 steps are distinguishable by ear and name; 2 is too coarse |
| Unit of listening | ○ continuous stream · ● sentence parts · ○ paragraphs | Sentences fit working memory (Sweller, 1988) and give natural stop points |
| When AI runs | ○ on each command (live) · ● once per document, all levels precomputed | No waiting mid-listen; level changes are instant |
| Fallback without AI | ● rule-based offline simplifier · ○ none | Works in demos, tests and with no connection |
| Word help | ○ always inline · ● on request · ○ never | Unprompted definitions add load; on request respects experts |
| Input | ● clipboard · ● camera scan · ● text box · ○ share sheet / email / files | Covers "I copied something" and "paper in front of me"; integrations are out of scope |
| Output modality | ● self-voicing TTS + earcons · ○ rely on user's screen reader · ○ braille | Self-voicing gives control over rate, parts and earcons; braille is future work |
| Input modality | ● buttons · ● gestures · ● keyboard · ● voice (push-to-talk, optional hands-free) | Redundancy: each user picks what they already know |
| Platform | ● web app, phone and laptop (PWA) · ○ native Android/iOS | One codebase and instant demo; native is future work |
