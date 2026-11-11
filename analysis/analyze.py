"""Analyse SimpliSpeak study sessions.

    python analysis/analyze.py                 # reads study/data/*.json
    python analysis/analyze.py path/to/sessions.json   # or an exported JSON file

Writes analysis/results/: tasks.csv, summary.md and charts (PNG) for the report.
Within-subjects comparison: each participant did one text in Baseline (plain reading)
and one in SimpliSpeak, counterbalanced. With small samples, report medians and the
Wilcoxon signed-rank test, and treat p-values as indicative only.
"""
import csv
import json
import statistics as st
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "results"


def load(paths):
    sessions = []
    for p in paths:
        data = json.loads(Path(p).read_text(encoding="utf-8"))
        sessions.extend(data if isinstance(data, list) else [data])
    return sessions


def task_rows(sessions):
    rows = []
    for s in sessions:
        for t in s["tasks"]:
            if t.get("practice"):
                continue
            acts = [e for e in t["events"] if e["event"] == "action" and e.get("modality") != "auto"]
            n = lambda f: sum(1 for e in acts if f(e))
            rows.append({
                "participant": s["participant"], "group": s["group"], "mode": s.get("mode", ""), "vision": s.get("vision", ""),
                "task": t["text"], "condition": t["condition"], "input": t.get("input_used") or t["input"],
                "input_s": round(t["input_ms"] / 1000, 1) if t.get("input_ms") else "",
                "listen_s": round(t["listen_ms"] / 1000, 1) if t.get("listen_ms") else "",
                "score": t.get("score"), "rtlx": t.get("rtlx"),
                "level_changes": n(lambda e: e["action"] in ("simpler", "detail")),
                "explains": n(lambda e: e["action"] == "explain"),
                "originals": n(lambda e: e["action"] == "original"),
                "repeats": n(lambda e: e["action"] == "repeat"),
                "backs": n(lambda e: e["action"] == "back"),
                "voice": n(lambda e: e["modality"] == "voice"),
                "gesture": n(lambda e: e["modality"] == "gesture"),
                "keyboard": n(lambda e: e["modality"] == "keyboard"),
                "button": n(lambda e: e["modality"] == "button"),
                "voice_fails": sum(1 for e in t["events"] if e["event"] == "voice_fail"),
                "limits": sum(1 for e in t["events"] if e["event"] == "limit"),
                "unsure_shown": sum(1 for e in t["events"] if e["event"] == "unsure_shown"),
                "restarts": sum(1 for e in t["events"] if e["event"] == "restart"),
                "final_level": t.get("final_level", ""),
                "levels_used": " ".join(t.get("levels_used", [])),
            })
    return rows


def describe(vals):
    vals = [v for v in vals if v not in ("", None)]
    if not vals:
        return "n/a"
    sd = st.stdev(vals) if len(vals) > 1 else 0
    return f"mean {st.mean(vals):.2f} (SD {sd:.2f}), median {st.median(vals):.2f}, n={len(vals)}"


def paired(rows, metric):
    by = {}
    for r in rows:
        if r["input"] == "scan" or r["task"] == "bill":
            continue
        if r[metric] in ("", None):
            continue
        by.setdefault(r["participant"], {})[r["condition"]] = float(r[metric])
    pairs = [(v["baseline"], v["simplispeak"]) for v in by.values() if "baseline" in v and "simplispeak" in v]
    return pairs


def wilcoxon(pairs):
    try:
        from scipy.stats import wilcoxon as w
    except ImportError:
        return "scipy not installed"
    diffs = [b - a for a, b in pairs]
    if len(pairs) < 5 or all(d == 0 for d in diffs):
        return f"too few non-zero pairs for a test (n={len(pairs)})"
    res = w([a for a, _ in pairs], [b for _, b in pairs])
    return f"Wilcoxon W={res.statistic:.1f}, p={res.pvalue:.3f}, n={len(pairs)}"


def charts(rows, sessions):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return []
    made = []
    for metric, label in [("score", "Comprehension (share correct)"), ("rtlx", "Workload, Raw TLX (0-100, lower is better)"),
                          ("listen_s", "Time to finish (s)")]:
        pairs = paired(rows, metric)
        if not pairs:
            continue
        fig, ax = plt.subplots(figsize=(4.5, 4))
        for a, b in pairs:
            ax.plot([0, 1], [a, b], color="#9aa0a6", linewidth=1, zorder=1)
        ax.scatter([0] * len(pairs), [a for a, _ in pairs], color="#5f6368", zorder=2, label="Baseline")
        ax.scatter([1] * len(pairs), [b for _, b in pairs], color="#1a73e8", zorder=2, label="SimpliSpeak")
        ax.set_xticks([0, 1], ["Baseline\n(plain reading)", "SimpliSpeak"])
        ax.set_xlim(-0.4, 1.4)
        ax.set_ylabel(label)
        ax.set_title(f"{label.split(' (')[0]} by condition (n={len(pairs)})", fontsize=10)
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        path = OUT / f"paired_{metric}.png"
        fig.savefig(path, dpi=160)
        plt.close(fig)
        made.append(path.name)

    simp = [r for r in rows if r["condition"] == "simplispeak"]
    if simp:
        mods = {m: sum(r[m] for r in simp) for m in ("voice", "gesture", "keyboard", "button")}
        fig, ax = plt.subplots(figsize=(5, 3))
        ax.barh(list(mods), list(mods.values()), color="#1a73e8")
        ax.set_xlabel("Commands used (SimpliSpeak tasks)")
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        fig.savefig(OUT / "modalities.png", dpi=160)
        plt.close(fig)
        made.append("modalities.png")

        finals = Counter(r["final_level"] for r in simp)
        order = ["original", "light", "simple", "very_simple"]
        fig, ax = plt.subplots(figsize=(5, 3))
        ax.bar([o.replace("_", " ") for o in order], [finals.get(o, 0) for o in order], color="#1a73e8")
        ax.set_ylabel("Tasks")
        ax.set_title("Level at the end of each SimpliSpeak task", fontsize=10)
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        fig.savefig(OUT / "final_levels.png", dpi=160)
        plt.close(fig)
        made.append("final_levels.png")
    return made


def main():
    paths = sys.argv[1:] or sorted((ROOT / "study" / "data").glob("*.json"))
    if not paths:
        print("No sessions found in study/data/. Run a study session first.")
        return
    sessions = load(paths)
    rows = task_rows(sessions)
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "tasks.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    md = [f"# SimpliSpeak study results\n", f"Participants: {len(sessions)}  ",
          f"Vision: {dict(Counter(s.get('vision', '?') for s in sessions))}\n",
          "## Baseline vs SimpliSpeak (paste tasks, within subjects)\n",
          "| Measure | Baseline | SimpliSpeak | Test |", "|---|---|---|---|"]
    for metric, label in [("score", "Comprehension"), ("rtlx", "Raw TLX workload"), ("listen_s", "Time (s)")]:
        pairs = paired(rows, metric)
        md.append(f"| {label} | {describe([a for a, _ in pairs])} | {describe([b for _, b in pairs])} | {wilcoxon(pairs)} |")

    sus = [s["sus"]["score"] for s in sessions if s.get("sus")]
    md += ["\n## Usability and trust\n", f"- SUS: {describe(sus)} (68 is the usual average benchmark)",
           f"- Trust (1-5): {describe([s['post'].get('trust') for s in sessions if s.get('post')])}",
           f"- Control (1-5): {describe([s['post'].get('control') for s in sessions if s.get('post')])}"]
    for key in ("version_pref", "input_pref", "level_pref"):
        md.append(f"- {key}: {dict(Counter(s['post'].get(key) for s in sessions if s.get('post')))}")

    simp = [r for r in rows if r["condition"] == "simplispeak"]
    md += ["\n## How SimpliSpeak was used\n",
           f"- Level changes per task: {describe([r['level_changes'] for r in simp])}",
           f"- Explain requests per task: {describe([r['explains'] for r in simp])}",
           f"- Original requests per task: {describe([r['originals'] for r in simp])}",
           f"- 'Not clear' restarts per task: {describe([r['restarts'] for r in simp])}",
           f"- Final level: {dict(Counter(r['final_level'] for r in simp))}",
           f"- Commands by modality: " + str({m: sum(r[m] for r in simp) for m in ('voice', 'gesture', 'keyboard', 'button')}),
           f"- Voice recognition failures: {sum(r['voice_fails'] for r in rows)}",
           "\n## Input routes\n"]
    for route in ("paste", "scan", "type"):
        rr = [r for r in rows if r["input"] == route and r["input_s"] != ""]
        if rr:
            md.append(f"- {route}: time from task start to text loaded {describe([r['input_s'] for r in rr])}")

    made = charts(rows, sessions)
    if made:
        md += ["\n## Charts\n"] + [f"![{m}]({m})" for m in made]
    notes = [f"- **{s['participant']}**: {s['notes']}" for s in sessions if s.get("notes")]
    if notes:
        md += ["\n## Interview notes\n"] + notes
    (OUT / "summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"Wrote {OUT / 'summary.md'}, tasks.csv and {len(made)} chart(s).")


if __name__ == "__main__":
    main()
