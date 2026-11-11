# D. Evaluation of the hi-fi prototype with users

## Research questions (from Phase 1, slide 18)
1. Do listeners **understand more** with SimpliSpeak than with plain reading?
2. Is listening **effort lower**?
3. Is it **usable and trusted**?
4. **Which levels** do people pick, and which controls do they use?
5. **Clipboard or scan**: which input route do people prefer?
6. Can people finish tasks **without looking**?

## Design
- **Within-subjects**, two conditions:
  - **A, Baseline**: text read exactly as written, like a screen reader. Only play/pause/next/back/repeat.
  - **B, SimpliSpeak**: full prototype (levels, explain, original, feedback loop).
- **Counterbalanced**: the app assigns a group from the participant number (n mod 4), rotating
  which text (leaflet or bank letter) gets which condition, and which condition comes first.
  This controls for text difficulty and learning effects.
- **Methods combined**: performance measures + standard questionnaires + think-aloud + interaction logs + semi-structured interview.

## Participants
- Target: **8–12** (a multiple of 4 keeps groups balanced). 5 users find most usability problems
  (Nielsen); 8+ allows a paired Wilcoxon test.
- Ideal: blind or low-vision screen-reader users (contact the campus disability cell or a local
  school for the blind or NGO). Supplement: sighted participants **blindfolded**, reported separately.
- Record: vision, screen-reader experience, age (study setup screen).

## Session (≈ 35 minutes)
| Step | Time | What happens |
|---|---|---|
| Consent | 3 min | Read the consent script (below) aloud; tick "Consent given" |
| Practice | 5 min | Task 0: library note. Facilitator shows each control: buttons, gestures, keys, voice |
| Task 1 | 6 min | Text via **clipboard**, condition A or B → 4 comprehension questions → 6 TLX ratings |
| Task 2 | 6 min | Other text, other condition → questions → TLX |
| Task 3 | 6 min | Electricity bill, **printed**, via **scan**, SimpliSpeak → questions → TLX |
| Questionnaires | 4 min | SUS (10), trust and control (2), preferences (3) |
| Interview | 5 min | 6 questions shown on the notes screen; facilitator types notes |

During tasks, ask participants to **think aloud** ("say what you're thinking and what you're
trying to do"). Note critical incidents: hesitation, wrong command, "I'm lost", doubting the text.

### Facilitator checklist
- Laptop or phone with Chrome or Edge, headphones, server running (`python server.py`).
- Print the bill from `http://localhost:8000/print.html?doc=bill`.
- Pick the participant's mode on the setup screen: **Audio mode** (screen reader off) or **Screen reader mode** (TalkBack/VoiceOver on).
- Phone: run `python server.py --mobile` and open the printed https link (see README).
- Enter the participant number and press Start. The app runs the rest and saves to `study/data/P##.json`.

### Consent script (read aloud)
> "We are testing an app called SimpliSpeak, not you. You will listen to three short texts,
> answer a few questions about each, and tell us what you think. It takes about 35 minutes. The
> app records which buttons and commands you use, and your answers. It does not record your voice.
> We will not record your name; you will be called P and a number. You can stop at any time
> without giving a reason. The texts are made up for this study and are not real medical or
> bank advice. Do you agree to take part?"

## Measures (all collected automatically by study mode)
| Question | Measure | Source |
|---|---|---|
| Understanding | Share of 4 multiple-choice questions correct | In-app questions (audio, keys 1–4) |
| Effort | Raw NASA-TLX, 6 subscales, 0–100 | In-app after each task |
| Usability | SUS score, 0–100 (68 = average) | In-app after all tasks |
| Trust, control | 1–5 Likert | In-app |
| Efficiency | Time from task start to "clear"; time to get text in | Log |
| Errors | Voice recognition failures, limit hits, "not clear" restarts, back/repeat counts | Log |
| Level choice | Levels heard, final level, level changes | Log |
| Modality use | Commands per modality (voice / gesture / keyboard / button) | Log |
| Preferences | Version, input route, most useful level | In-app |
| Qualitative | Think-aloud incidents, interview notes | Facilitator notes |

## Analysis
```
python analysis/analyze.py
```
Writes `analysis/results/summary.md`, `tasks.csv` and charts (paired dot plots for comprehension,
TLX and time; modality use; final level). Compare A vs B with medians and the **Wilcoxon
signed-rank test** (paired, non-parametric, suitable for small n). Report effect direction per
participant (how many improved). Analyse think-aloud and interview notes with a quick **affinity
diagram**: group the issues, then rate their severity (Nielsen 0–4).

## Reporting outcomes (template)
- *n* participants (*x* blind, *y* low vision, *z* blindfolded).
- Comprehension: A median __ vs B median __ (W=__, p=__); __ of __ participants improved.
- Raw TLX: A __ vs B __.
- SUS: mean __ (grade __).
- Most chosen level: __; level changes per task: __; explain uses: __.
- Preferred input: clipboard __ / scan __.
- Top 3 usability problems with severity, and the design change each one leads to.

## Threats to validity (say these in the viva)
- Small sample; blindfolded sighted users are not experienced screen-reader users.
- Novelty effect for B. Mitigated by the practice task and counterbalancing.
- The texts differ in difficulty. Mitigated by rotating text and condition.
- Hand-written levels in the study measure the *interaction*. The AI quality is shown separately in the demo.
