# SimpliSpeak: live phone demo, presenter script

Print this and keep it next to you. Each step lists **what you do** on the phone, **what the app says**,
and **what you tell the audience**. Total: about 6 minutes. `SimpliSpeak_demo.mp4` (same folder)
follows exactly these steps, so watch it once before you present, and keep it as a backup if the live demo fails.

## 1. Setup (15 minutes before)

| | |
|---|---|
| Laptop | `cd Downloads\SimpliSpeak` then `python server.py --mobile`. Keep the window open. Note the "On your phone" link (e.g. `https://10.7.36.141:8443`). |
| Network | Phone and laptop on the **same Wi-Fi**. If campus Wi-Fi blocks it, connect the laptop to the **phone's hotspot** and restart the server (the IP changes). |
| Phone | Open the link in **Chrome**. Accept the warning: **Advanced → Proceed**. Menu ⋮ → **Add to Home screen**, then open it from the icon (full screen, looks like an app). |
| Sound | Volume to max, or connect a **Bluetooth speaker**. The voice *is* the interface: if the audience can't hear it, they can't follow the demo. |
| Screen | Mirror the phone to the projector. Android: **Quick settings → Cast / Smart View**. Or open the phone in Chrome on the laptop via **Phone Link**, or hold it under a document camera. |
| Clipboard | Copy the bank letter below on the phone (e.g. from WhatsApp "message yourself") for step 6. |
| Fresh start | If you've practised before, the app remembers your mode and skips the full welcome. To reset: Chrome ⋮ → **Settings → Site settings → All sites → (your link) → Clear & reset**. |

Bank letter to copy:
> Pursuant to the periodic review of your account, you are required to submit the requisite KYC documents prior to 15 December 2026. Failure to comply may result in suspension of debit transactions on your account. Documents may be submitted electronically or at your nearest branch.

**The one rule to remember:** swipe right/left = hear the next/previous option, **double tap anywhere** = choose.
You never need to aim at a button.

## 2. The demo

| # | You do | App says (roughly) | You tell the audience |
|---|---|---|---|
| 0 | Hold up the phone | (nothing) | "Ravi is blind. A screen reader reads his medicine leaflet word for word: *'concomitant use with potassium-sparing diuretics'*. He hears it, but doesn't understand it. SimpliSpeak lets **him** choose how simple the text should be." |
| 1 | **Tap anywhere** on the screen | "Welcome to SimpliSpeak… Audio mode… Home menu." | "One big button, so there's nothing to find. A tap means audio mode, where the app talks and you use gestures anywhere." |
| 2 | **Swipe right** ×2 | "Paste from clipboard… Scan paper… Samples, 3 of 7" | "Every screen is a spoken list. Swipe to hear, double tap to choose. Same habit as TalkBack." |
| 3 | **Double tap**, **swipe right**, **double tap** | "Samples… Lisinor 10 mg tablets… 8 parts. How simple should it be?" | "I picked the medicine leaflet." |
| 4 | **Swipe up / down** a few times | "Very simple: This medicine is Lisinor 10 mg…" / "Light: …" | "Each level reads the first sentence aloud, so Ravi chooses by *ear*, not by a label." |
| 5 | Stop at **Simple**, **double tap** | Part 1, then part 2 plays | "It reads one sentence at a time. Listeners can't glance back, so each part must be easy to hold in memory." |
| 6 | Mid-sentence: **swipe up** | *chime* "Very simple" + same part, simpler | "Same part, simpler words. **He never loses his place.**" |
| 7 | Next part: **swipe down** | *chime* "Simple" + same part, more detail | "And back up if it's too basic. Respect, not dumbing down." |
| 8 | **Double tap** (pause), then **hold** a finger down | "exceed: go over a limit." Hold again: "prescribed: ordered for you by a doctor." | "Hard words are explained on demand." |
| 9 | **Two-finger tap** | "Original wording. Do not exceed the prescribed dose…" | "The exact original is always one gesture away. Simplification never hides anything." |
| 10 | **Two-finger swipe down** (menu), **swipe right** to *Paste from clipboard*, **double tap** | "Pasted 45 words. Simplifying…" (~10 s) | "Now any real text. I copied a bank letter. Gemini writes all levels in one go." |
| 11 | **Swipe up** to *Very simple*, **double tap** | "We are reviewing your account. Send your KYC documents. Do this before 15 December 2026…" | "Notice the **date is kept exactly**. A guard checks every number and every *do not* on every level. If a level loses one, the app warns and reads the original." |
| 12 | Let it finish | "End of the text. Was it clear?" | "The listener closes the loop." |
| 13 | **Swipe right** (No) → **swipe left** (Yes) → **double tap** | "Well done. You finished at level Very simple." | "*No* would restart one level simpler." |
| 14 | (optional) **Two-finger swipe up**, say *"what does renal mean"* | "renal: to do with the kidneys" | "Voice commands work too." (Needs Chrome mic permission; test it beforehand.) |
| 15 | (optional) Home → **Scan paper**, hold over a printed bill (`/print.html?doc=bill`) | "Move the phone up… Hold still…" → captures by itself | "No need to aim a camera you can't see." |
| 16 | (optional) Settings → **Switch to screen reader mode**, turn on TalkBack | TalkBack reads labelled buttons | "TalkBack users keep their own voice and speed." |

**Close:** "The listener, not the AI, decides how simple."

## 3. Tips

- **Strongest move:** do steps 1–13 **with your eyes closed**. It proves nothing needs sight.
- Narrate *before* each gesture ("now I'll swipe up"), then go quiet and let the app speak. Don't talk over it.
- If the gesture labels on screen help, show the hint row at the bottom of each screen. It lists every gesture.
- **If the AI is slow or offline:** the samples are hand-written and still work. Say: "Without the network it falls back to offline mode. That's a design feature."
- **If the phone can't reach the laptop:** use the hotspot, or play `SimpliSpeak_demo.mp4` from the laptop.
- On a laptop instead of a phone: open `http://localhost:8000`, *click* Start (audio mode), and use the arrow keys (→ ← next/back, ↑ ↓ simpler/detail), Space (play/pause), E (explain), O (original) and Esc (menu).
