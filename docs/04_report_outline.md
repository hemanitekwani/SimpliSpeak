# E. Report outline (mapped to the rubric)

Suggested length: 8–12 pages plus appendix. Headings follow the rubric so the marker can tick each part.

1. **Introduction** (½ page): problem (audio makes hard writing harder: linear, fleeting, dense), users (Asha, Ravi), proposal ("the listener, not the AI, decides how simple").
2. **Background** (½ page): reuse slide 4 references (Sweller; WCAG 3.1.5; COGA; Siddharthan; Borodin; Asakawa; Blattner).
3. **Conceptual model** (rubric C, 10%): from `01_conceptual_model.md`. Include the metaphor table, objects/actions table, flow diagram, earcon table and design-space table.
4. **High-fidelity prototype** (rubric A, 40%)
   - Architecture diagram: browser (TTS, recognition, gestures, OCR) ↔ Python server ↔ Claude API; offline rules; guard.
   - Screens: screenshots of Home, Scan, Level chooser, Listen (with word help), Feedback, Settings, Study.
   - Walk through Ravi's user story with screenshots: paste → Simple → "simpler" → "what does hepatic mean" → "Yes, clear".
   - Protected-facts guard: show an example where a number would be lost, and the caution behaviour.
   - Accessibility checklist: labelled controls, focus order, live regions, 52 px+ targets, high contrast, large text, reduced motion, no sight required.
5. **Compromises** (rubric B, 10%): from `02_prototype_compromises.md`. Use the vertical/horizontal tables and the "changes from Phase 1" table.
6. **Evaluation** (rubric D, 20%): method, participants, procedure, measures (from `03_evaluation_protocol.md`). Results: the `summary.md` table, the paired charts, SUS, top usability issues with severity, quotes. Then a discussion: what worked, what didn't, the design changes made or proposed.
7. **Limitations and future work**: native screen-reader integration, braille, Hindi and other languages, share sheet, AI confidence, larger study with blind users.
8. **References**.
9. **Appendix**: consent script, questionnaire items, task texts with all four levels, raw `tasks.csv`.

## Figures to capture
- Screenshots (laptop, or phone at 390 px width): use a sample, and turn on "Show text".
- `analysis/results/*.png` after the study.
- One photo of a scanning session (with consent), or the printed bill being scanned.
