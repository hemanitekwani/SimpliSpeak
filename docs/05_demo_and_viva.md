# Demo script (5 minutes) and viva preparation

## Before the demo
- On the laptop: `python server.py --mobile`. On the phone: open the printed https link and accept the certificate warning (see README). Add it to the home screen.
- Mirror the phone to the projector (Android: Cast / Screen mirroring; iPhone: AirPlay), or hold it under a document camera, so the audience sees the big text while you control it without looking.
- Connect the phone to a Bluetooth speaker or the room audio. The audio **is** the interface.
- Print the bill (`/print.html?doc=bill`) for the scan demo.
- Copy a dense paragraph (e.g. an insurance clause) on the phone for the AI demo.
- **Strong move:** do the whole demo with your eyes closed or blindfolded. It proves nothing needs sight.
- **Backup**: if the network fails, samples and offline mode still work. Say so; it is a design feature.

## Script: follow Ravi's story (audio mode)
1. **(30 s) Problem.** "A screen reader reads exactly what is written." Play part of the leaflet at Original.
2. **(30 s) No sight needed.** Tap Start anywhere. The app speaks the home menu. Swipe right through options, double tap **Samples**, then the leaflet.
3. **(45 s) Choose a level by ear.** Swipe up and down: each level is read aloud as a preview. Double tap to start at Simple.
4. **(60 s) Core loop.** Let 2 parts play. Swipe **up** mid-part: *same part, simpler words*. Swipe down: more detail. "Changing how it's said never changes where you are."
5. **(45 s) Word help + original.** At part 7, **hold** a finger down: "hepatic: to do with the liver". **Two-finger tap**: the exact original. "Simplification never hides anything."
6. **(30 s) Voice.** Two-finger swipe up, say "what does renal mean".
7. **(45 s) Real AI.** Two-finger swipe down (menu) → **Paste from clipboard** → "Pasted 87 words" → Gemini makes all levels in about 10 s → listen at Very simple. "Numbers and warnings are checked automatically on every level."
8. **(30 s) Scan.** Scan paper → hold over the printed bill → spoken guidance ("Hold still") → it captures by itself.
9. **(20 s) Feedback loop.** At the end: "Was it clear?" Swipe to No and double tap: restarts one level simpler.
10. **(20 s) Screen reader mode.** Settings → Switch to screen reader mode, turn on TalkBack: same app, now ordered buttons read by TalkBack's own voice.
11. **(20 s) Study mode.** Show setup and the results charts.

## Likely viva questions
- **Why let the user choose the level instead of the AI deciding?** Autonomy and dignity (Asha does not want to be talked down to), different needs per person and per document, and trust: users can always check the original.
- **How do you stop the AI from changing facts?** Three layers: prompt rules, the automatic guard on numbers and negations, and the honest fallback to the original with a caution earcon. Limitation: the guard cannot detect every meaning change, which is why Original is always one command away.
- **Why sentences as parts?** Working-memory limits (Sweller). Listeners cannot glance back, so a sentence is a natural chunk and a navigation unit.
- **Why precompute all levels?** So level changes are instant. A network wait mid-sentence would break the flow.
- **Why both hand-written and AI levels?** The study needs controlled stimuli, so every participant hears identical wording. The demo shows the AI generalises to new text.
- **Horizontal vs vertical?** A T-shape: all 11 screens exist (breadth), and the core loop is fully real, from AI to guard to TTS to the four input modalities (depth).
- **How does a blind user find the buttons?** They don't have to. In audio mode the whole screen is one gesture surface and every screen is a spoken list (swipe to hear, double tap anywhere to choose). Instructions never point at screen positions.
- **How does it work with TalkBack/VoiceOver?** TalkBack captures swipes, so a web page cannot receive them. Screen reader mode therefore uses ordered, labelled buttons and hands the text to TalkBack through a live region, so the user keeps their own voice and speed and two voices never overlap. The mode is picked from how Start is pressed, and can be switched any time. A native app could add custom actions.
- **Why Gemini?** Fast (about 10 s per document) with JSON-schema output, so all levels for every sentence arrive in one request. The guard checks its output regardless of provider, and the app falls back to offline rules if the AI is unavailable.
- **Why within-subjects?** Blind participants are hard to recruit, and within-subjects halves the number needed and controls for individual differences. Counterbalancing controls order and text effects.
- **Why SUS and NASA-TLX?** Both are standard, validated and comparable across studies. TLX on a 7-point scale for audio answering is a stated compromise.
- **What would you change next?** Use the study results (top-severity issues). Likely candidates: native screen-reader integration, Hindi support, an AI confidence signal, smarter scan guidance (page edges).
- **Earcons: why?** They carry state without extra words (Blattner et al., 1989), which matters at fast speech rates (Asakawa et al., 2003).
