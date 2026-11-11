# F. Related work and what is new in SimpliSpeak

> Citations are from memory of the literature. Check each one (author, year, venue) before the
> final report goes in.

## 1. What exists today

| Area | Examples | What they do | Gap for our users |
|---|---|---|---|
| **Screen readers and read-aloud** | TalkBack, VoiceOver, NVDA; NaturalReader, Speechify | Speak text exactly as written. Speed control only. | Hard wording stays hard. Speeding up does not help comprehension. |
| **Camera-to-speech for blind users** | Seeing AI (Microsoft), Google Lookout, Envision, KNFB Reader | OCR a page and read it aloud. | Reads the page as is. No simplification. Capture needs aiming by sight. |
| **Describe-or-answer assistants** | Be My AI, Envision Ask, Seeing AI chat | A model describes or summarises on request. | The model chooses the wording and the length. The listener cannot steer, and there is no fixed place in the text. Summaries can drop warnings and numbers. |
| **Automatic text simplification (NLP)** | Surveys: Siddharthan 2014; Alva-Manchego et al. 2020. Controllable models: Martin et al. 2020 (ACCESS); Agrawal and Carpuat 2023. LLM simplification: Kew et al. 2023 | Rewrite text at a target level, measured on text benchmarks. | Evaluated on screens and with sighted readers. The level is fixed by the system or the developer. |
| **Human plain-language practice** | Easy Read (Inclusion Europe), plain-language summaries (Cochrane), Newsela levelled news | Written by humans at a few set levels. | Does not scale to a letter you just received. Not interactive. |
| **Simplification for cognitive accessibility** | Rello et al. 2013 (dyslexia, DysWebxia); W3C COGA guidance | Tools and rules for readers with dyslexia or cognitive disability. | Visual reading interfaces. Nothing for audio-only use. |
| **Audio browsing and skimming** | Arons 1997 (SpeechSkimmer); Asakawa et al. 2003 (blind users and speech rate) | Faster speech, pausing, jumping around in audio. | Changes how fast the words come, not how hard the words are. |

## 2. The gap

Blind users already have good tools to **get text into audio**. Simplification research already
has good methods to **make text easier**. Almost nothing joins the two in a way that:

1. works **without sight** at every step (choosing mode, bringing text in, steering, answering),
2. lets the **listener** set the difficulty, and change it at any moment, and
3. makes sure **simpler never means wrong** (numbers, doses, deadlines, warnings).

## 3. What SimpliSpeak adds

1. **The listener controls the level, not the AI.** One dial (Original, Light, Simple, Very simple)
   changed mid-sentence by swipe, voice or button. It never moves your place in the text
   (*"changing how something is said never changes where you are"*).
2. **Instant, on-demand help in audio.** Hold to hear a hard word explained; one gesture to hear
   the exact original; "Was it clear?" at the end moves one level simpler. No typing.
3. **A protected-facts guard.** Numbers, dates, doses and warnings in the source are checked
   against every simplified level. A sentence that loses one is flagged to the listener rather
   than trusted. This targets the main risk of LLM simplification, which is silent omission.
4. **No sight needed anywhere.** The whole screen is the control surface, and one rule covers
   every screen (swipe = next, double tap = choose). A second mode hands speech to the user's own
   screen reader. The start button picks the mode from how it was pressed. The camera captures
   by itself once the page is steady.
5. **Safe failure.** If the AI is busy or the key is wrong, the app falls back to a rule-based
   offline simplifier, hand-written samples and a local word list, and tells the listener plainly.
6. **Built to be tested.** Study mode runs counterbalanced tasks with comprehension questions,
   NASA-TLX and SUS, and logs everything for analysis.

## 4. One-paragraph claim (for the report or viva)

> Existing tools either read text aloud unchanged or let an AI rewrite it, and in both cases the
> blind listener has no control over difficulty. SimpliSpeak is, to our knowledge, a
> non-visual interface that gives the listener a continuous simplicity dial with a stable reading
> position, on-demand word explanations, and a guard that flags simplifications that lose
> numbers or warnings. It is evaluated against plain read-aloud with blind and blindfolded users.

## 5. How to show it is better (hypotheses)

| Compared with | Measure | Expected |
|---|---|---|
| Plain read-aloud of the original | Comprehension questions correct | Higher |
| One-shot AI summary | Warnings and numbers recalled; sense of control | Higher control; fewer lost facts |
| All conditions | NASA-TLX, SUS, time to finish | Lower workload; acceptable time |
