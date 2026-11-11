# SimpliSpeak: HCI Phase 2 high-fidelity prototype

AI-based text simplification for cognitive accessibility in audio interfaces for blind users.
The listener, not the AI, decides how simple the text should be.

## 1. Set up (once)

```bash
pip install -r requirements.txt
```
Put your AI key in a file called `.env` next to `server.py` (it is already there, and git-ignored):
```
GEMINI_API_KEY=your-key
```
Without a key the app still works in offline mode: the samples use hand-written levels, and new
text gets basic rule-based simplification.

## 2. Run on your phone

```bash
python server.py --mobile
```
(On Windows you can also double-click `start-phone.bat`.) It prints a link such as
`https://10.7.36.141:8443` **and a QR code**: scan the QR code with the phone camera instead of typing.
1. Connect the phone to the **same Wi-Fi** as the laptop.
2. Open the link in **Chrome** (Android) or **Safari** (iPhone).
3. The phone warns that the connection is not private. That is expected, because the
   certificate is made by the laptop. Tap **Advanced → Proceed** (Chrome) or **Show details →
   visit this website** (Safari).
4. If the page doesn't load, Windows Firewall is blocking it: allow Python on **Private networks**
   (Windows Security → Firewall → Allow an app), or connect the laptop to the phone's hotspot.
5. Optional: browser menu → **Add to Home screen**, so it opens full screen like an app.

HTTPS is needed because phones only allow the microphone (voice commands), the camera (scan)
and the clipboard on secure pages.

Campus Wi-Fi often blocks device-to-device traffic. If the phone can't reach the laptop, use the
phone's hotspot, or a tunnel: `ssh -R 80:localhost:8000 localhost.run` (no install; it prints a
public https link) while `python server.py` runs.

## 3. Run on the laptop
```bash
python server.py        # http://localhost:8000 in Chrome or Edge
```

## Two versions of the app

* **Main app** (`/`, the page you open first): **voice-guided**. Tap anywhere once and the app reads out
  everything on the screen, then listens ("paste", "photo", "example"). Three big buttons do the same
  by touch. The text is read sentence by sentence with the current sentence highlighted; say or tap
  *simpler / more detail* at any time, tap a sentence to jump, tap an underlined word for its meaning.
  The **🔊 Read screen** button re-reads whatever is on screen.
  **Simple version in Hindi**: on the first screen choose **English / हिंदी** (or say "Hindi"). The AI then
  writes Light, Simple and Very simple in everyday Hindi and the app reads them with a Hindi voice; *Original*
  stays the exact English text. Numbers stay as digits, and the facts guard understands Hindi warnings
  (नहीं, मत, …) and Hindi number words. Needs the AI key (offline mode stays English).

  **Touch mode** (the default after "Tap anywhere to start", for people who cannot see the screen):

  | Gesture | Does |
  |---|---|
  | Swipe right / left | Hear the next / previous button (the app says its name and "3 of 7") |
  | Double tap anywhere | Choose the button just heard |
  | Tap | Hear the current button again |
  | Hold finger down | Hear the whole screen and the gestures again |
  | Swipe up / down | Simpler / more detail (while reading) |
  | Two-finger tap | Pause / play |
  | Two-finger swipe up | Voice command (then speak) |
  | Two-finger swipe down | Back / close |

  Sighted users choose **"I can see the screen: use buttons"** on the opening screen (or say "show buttons").
* **Accessibility and study version** (`/classic.html`, linked from "How it works"): works with
  TalkBack/VoiceOver or with gestures anywhere on the screen, and contains **Study mode** for the evaluation.
  Everything below describes this version.


The start screen has two buttons:

* **Start**: normal mode. Big buttons you can tap, the app reads everything aloud, and a round
  **microphone button** (bottom right) takes voice commands. Best for most people and for demos.
* **I use TalkBack or VoiceOver**: screen reader mode. The same buttons, read by the user's own screen reader.

**Gesture mode** (no-look use for blindfolded or blind testers) is in *Settings → Switch to gesture mode*.
There the whole screen is one gesture surface, so on-screen buttons are not tappable by design.

| | Normal mode | Screen reader mode | Gesture mode |
|---|---|---|---|
| Who speaks | The app | The user's screen reader | The app |
| Control | Tap buttons, mic button | Screen reader navigation | Gestures anywhere |

Every screen in gesture mode is a **spoken list**: *swipe right/left* to hear the options, *double
tap anywhere* to choose. That is the same habit screen-reader users already have, so there is
one rule to learn, not one per screen.

### Gestures (audio mode)

| Gesture | In lists | While listening |
|---|---|---|
| Swipe right / left | next / previous option | next / previous part |
| Double tap | choose | play / pause |
| Tap | repeat the option | repeat the part |
| Swipe up / down | change a setting, or a level | simpler / more detail |
| Hold | help for this screen | explain a hard word |
| Two-finger tap | — | original wording |
| Two-finger swipe up | voice command | voice command |
| Two-finger swipe down | back | menu (Continue listening keeps your place) |

Voice commands: *next, back, repeat, simpler, more detail, original, explain, what does hepatic
mean, faster, slower, where am I, help*. In lists you can say the option's name: *"samples"*, *"scan"*, *"yes"*.
Keyboard: arrows, Space, Enter, E, R, O, W, V, Escape. *How to use → Practice the gestures* lets
a new user try every gesture and hear what it does.

## What's inside

| Path | What |
|---|---|
| `server.py` | HTTP/HTTPS server and API (`/api/simplify`, `/api/explain`, `/api/samples`, `/api/study/*`), `--mobile` mode |
| `simplispeak/gemini.py` | Gemini simplification: all levels + glossary in one JSON-schema request (`gemini-3.5-flash`, backup `gemini-3.1-flash-lite`) |
| `simplispeak/ai.py` | Alternative provider (Claude), used if `ANTHROPIC_API_KEY` is set instead |
| `simplispeak/guard.py` | Protected-facts guard (numbers, warnings) on every level |
| `simplispeak/rules.py` | Offline simplifier and word list |
| `simplispeak/samples.json` | Study texts with hand-written levels and comprehension questions |
| `web/js/app.js` | Modes, spoken lists, listening loop, word help, scan with auto-capture |
| `web/js/audio.js`, `gestures.js` | Speech, voice commands, earcons; full-screen gesture recognition |
| `web/js/study.js` | Study mode (counterbalanced tasks, questions, NASA-TLX, SUS) |
| `analysis/analyze.py` | Turns `study/data/*.json` into tables and charts |
| `docs/` | Conceptual model, compromises, evaluation protocol, report outline, demo and viva guide, related work and novelty |

## Running a study
Home → **Study mode** (facilitator) → participant number, mode, consent → Start. The participant
then does everything by gesture, voice or screen reader, including answering the questions.
Results go to `study/data/P##.json`; afterwards run `python analysis/analyze.py`.
See `docs/03_evaluation_protocol.md`.
