"""Gemini-powered simplification (Google Gemini API, REST via the standard library).

Same contract as ai.py: one request per document returns all three simplified levels for
every sentence plus a glossary.
"""
import json
import os
import time
import urllib.error
import urllib.request

from .prompts import EXPLAIN_LANG, SYSTEM, AIUnavailable, system_for

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# First model that answers wins; the second is a faster, lighter backup.
MODELS = [m.strip() for m in os.environ.get("GEMINI_MODELS", "gemini-3.5-flash,gemini-3.1-flash-lite").split(",") if m.strip()]
MODEL = MODELS[0]

_SIMPLIFY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "sentences": {"type": "ARRAY", "items": {
            "type": "OBJECT",
            "properties": {"index": {"type": "INTEGER"}, "light": {"type": "STRING"},
                           "simple": {"type": "STRING"}, "very_simple": {"type": "STRING"}},
            "required": ["index", "light", "simple", "very_simple"]}},
        "glossary": {"type": "ARRAY", "items": {
            "type": "OBJECT",
            "properties": {"term": {"type": "STRING"}, "explanation": {"type": "STRING"}},
            "required": ["term", "explanation"]}},
    },
    "required": ["sentences", "glossary"],
}
_EXPLAIN_SCHEMA = {"type": "OBJECT", "properties": {"explanation": {"type": "STRING"}}, "required": ["explanation"]}


def available() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


_NO_THINKING_CFG = set()


def _thinking_for(model):
    """The least 'thinking' each model family accepts (fast answers), or None."""
    if model in _NO_THINKING_CFG or "pro" in model or model.startswith("gemma"):
        return None
    if model.startswith("gemini-2.5"):
        return {"thinkingBudget": 0}
    if model.startswith(("gemini-3", "gemini-flash")):
        return {"thinkingLevel": "minimal"}
    return None


def _post(model, body, timeout):
    req = urllib.request.Request(
        API.format(model=model), data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _call(model, prompt, system, schema, timeout, image=None):
    parts = [{"text": prompt}]
    if image:                                   # (mime type, base64 data)
        parts.insert(0, {"inlineData": {"mimeType": image[0], "data": image[1]}})
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.2},
    }
    if schema:
        body["generationConfig"].update(responseMimeType="application/json", responseSchema=schema)
    # Rewording a sentence needs no deep reasoning; "thinking" made each request ~3x slower.
    thinking = _thinking_for(model)
    if thinking:
        body["generationConfig"]["thinkingConfig"] = thinking
    try:
        data = _post(model, body, timeout)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        if e.code == 400 and thinking and "thinking" in detail.lower():   # this model does not take that setting
            _NO_THINKING_CFG.add(model)
            body["generationConfig"].pop("thinkingConfig", None)
            data = _post(model, body, timeout)
        else:
            raise urllib.error.HTTPError(e.url, e.code, e.msg, e.hdrs, __import__("io").BytesIO(detail.encode())) from None
    cand = (data.get("candidates") or [{}])[0]
    if cand.get("finishReason") not in (None, "STOP"):
        raise AIUnavailable(f"The AI stopped early ({cand.get('finishReason')}).")
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    return json.loads(text) if schema else text


# Overloaded / rate-limited answers are usually gone within a second or two, so each model is
# retried briefly before moving to the backup model and, after that, to offline mode.
_RETRYABLE = {429, 500, 502, 503, 504}
_RETRY_DELAYS = (1.0,)                 # one quick retry, then move on to the next model
_BUSY = {}                             # model -> time until which it is treated as busy (skipped)
_BUSY_SECONDS = 120


# model -> time (epoch seconds) when its daily free quota comes back
_EXHAUSTED = {}


def quota_note():
    """A plain message when every model's daily limit is used up, else ''."""
    now = time.time()
    left = [t for m, t in _EXHAUSTED.items() if t > now]
    if not left:
        return ""
    hours = max(1, round((min(left) - now) / 3600))
    back = f"It comes back in about {hours} hour{'s' if hours != 1 else ''}."
    if len(left) >= len(MODELS):
        return f"The AI's free daily limit is used up. {back}"
    return f"The main AI's free daily limit is used up ({back[3:-1].lower()}), so I use the backup AI, which is sometimes busy."


def _daily_limit(detail):
    """Seconds until the quota resets if this 429 is a daily (not per-minute) limit, else 0."""
    try:
        err = json.loads(detail).get("error", {})
    except ValueError:
        return 0
    secs = 0
    for d in err.get("details", []):
        if str(d.get("@type", "")).endswith("RetryInfo"):
            try:
                secs = float(str(d.get("retryDelay", "0")).rstrip("s"))
            except ValueError:
                pass
    daily = "PerDay" in detail or secs > 600
    return (secs or 6 * 3600) if daily else 0


def _generate(prompt, system, schema, timeout=60, image=None, budget=None):
    last = "no model configured"
    budget = budget or timeout                # give up on the whole chain after this many seconds
    start = time.time()
    for model in MODELS:
        if _EXHAUSTED.get(model, 0) > time.time():
            last = "The AI's free daily limit is used up."
            continue
        if _BUSY.get(model, 0) > time.time():
            last = "Gemini is busy."
            continue
        left = budget - (time.time() - start)
        if left < 5:
            break
        timeout = min(timeout, max(5, left))
        for attempt in range(len(_RETRY_DELAYS) + 1):
            try:
                return _call(model, prompt, system, schema, timeout, image)
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")
                if e.code in (400, 401, 403):
                    # Spoken aloud to the listener, so say it briefly, never as a raw error dump.
                    if "api key" in detail.lower() or e.code in (401, 403):
                        raise AIUnavailable("The AI key was not accepted. Check GEMINI_API_KEY in the dot env file.") from e
                    raise AIUnavailable("The AI could not handle this request.") from e
                if e.code == 429:
                    wait = _daily_limit(detail)
                    if wait:                                   # daily limit: no point retrying this model today
                        _EXHAUSTED[model] = time.time() + wait
                        last = "The AI's free daily limit is used up."
                        break
                last = f"Gemini is busy (error {e.code})." if e.code in _RETRYABLE else f"Gemini error {e.code}."
                if e.code not in _RETRYABLE or attempt == len(_RETRY_DELAYS):
                    if e.code in (500, 502, 503, 504):
                        _BUSY[model] = time.time() + _BUSY_SECONDS       # skip it for a while
                    break
                time.sleep(_RETRY_DELAYS[attempt])
            except (urllib.error.URLError, TimeoutError) as e:
                last = f"Cannot reach Gemini: {e}"
                _BUSY[model] = time.time() + _BUSY_SECONDS
                break
            except (json.JSONDecodeError, KeyError, IndexError):
                last = "Gemini returned an unreadable answer."
                break
    note = quota_note()
    if note and "busy" in last:
        last = "The main AI's daily limit is used up, and the backup AI is busy right now."
    raise AIUnavailable(last if "busy" in last or not note else note)


def simplify(sentences, lang="en"):
    numbered = "\n".join(f"{i}. {s}" for i, s in enumerate(sentences))
    result = _generate(
        f"Simplify these {len(sentences)} sentences. Return exactly one entry per index "
        f"0 to {len(sentences) - 1}.\n\n{numbered}",
        system_for(lang), _SIMPLIFY_SCHEMA, timeout=90,
    )
    by_index = {s.get("index"): s for s in result.get("sentences", [])}
    out = []
    for i, original in enumerate(sentences):
        s = by_index.get(i)
        if not s:
            out.append({"original": original, "light": original, "simple": original, "very_simple": original})
        else:
            out.append({"original": original, "light": s["light"], "simple": s["simple"], "very_simple": s["very_simple"]})
    joined = " ".join(sentences).lower()
    glossary = {g["term"]: g["explanation"] for g in result.get("glossary", []) if g.get("term", "").lower() in joined}
    return out, glossary


def explain(term, context, lang="en"):
    result = _generate(
        f'Explain the word or phrase "{term}" as used in this sentence, in at most 20 plain '
        f"words, for someone listening by audio:\n\n{context}",
        "You explain hard words in plain, respectful language for listeners. No brackets or symbols." + EXPLAIN_LANG.get(lang, ""),
        _EXPLAIN_SCHEMA, timeout=30,
    )
    return result["explanation"]


def ocr(image_b64, mime="image/jpeg"):
    """Read the printed text in a photo (faster and more accurate than in-browser OCR)."""
    text = _generate(
        "Transcribe all the printed or handwritten text in this photo, in natural reading order. "
        "Join lines that belong to the same paragraph. Output only the text, with no commentary. "
        "If there is no readable text, output nothing.",
        "You are an accurate OCR engine for a blind user. Never add, summarise or correct anything.",
        None, timeout=45, image=(mime, image_b64),
    )
    return text.strip()
