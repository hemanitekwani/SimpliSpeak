"""Claude-powered simplification.

One request per document returns all three simplified levels for every sentence plus a
glossary, so changing level while listening is instant (no network wait mid-sentence).
"""
import os

from pydantic import BaseModel

from .prompts import EXPLAIN_LANG, SYSTEM, AIUnavailable, system_for

try:
    import anthropic
except ImportError:  # Gemini-only installs
    anthropic = None

MODEL = os.environ.get("SIMPLISPEAK_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("SIMPLISPEAK_EFFORT", "low")




class SentenceLevels(BaseModel):
    index: int
    light: str
    simple: str
    very_simple: str


class GlossaryEntry(BaseModel):
    term: str
    explanation: str


class Simplification(BaseModel):
    sentences: list[SentenceLevels]
    glossary: list[GlossaryEntry]


class Explanation(BaseModel):
    explanation: str


_client = None


def available() -> bool:
    return anthropic is not None and bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0, max_retries=1)
    return _client


def _parse(prompt: str, schema, system: str, max_tokens: int):
    try:
        response = _get_client().beta.messages.parse(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_format=schema,
            output_config={"effort": EFFORT},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.APIConnectionError as e:
        raise AIUnavailable(f"Cannot reach the AI service: {e}") from e
    except anthropic.AuthenticationError as e:
        raise AIUnavailable("The API key was rejected.") from e
    except anthropic.RateLimitError as e:
        raise AIUnavailable("The AI service is busy (rate limited).") from e
    except anthropic.APIStatusError as e:
        raise AIUnavailable(f"AI service error {e.status_code}: {e.message}") from e
    if response.stop_reason == "refusal":
        raise AIUnavailable("The AI declined to simplify this text.")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise AIUnavailable("The AI response was incomplete.")
    return response.parsed_output


def simplify(sentences: list[str], lang: str = "en") -> tuple[list[dict], dict[str, str]]:
    numbered = "\n".join(f"{i}. {s}" for i, s in enumerate(sentences))
    result: Simplification = _parse(
        f"Simplify these {len(sentences)} sentences. Return exactly one entry per index "
        f"0 to {len(sentences) - 1}.\n\n{numbered}",
        Simplification, system_for(lang), 32000,
    )
    by_index = {s.index: s for s in result.sentences}
    out = []
    for i, original in enumerate(sentences):
        s = by_index.get(i)
        if s is None:  # model skipped one: keep the original rather than invent
            out.append({"original": original, "light": original, "simple": original, "very_simple": original})
        else:
            out.append({"original": original, "light": s.light, "simple": s.simple, "very_simple": s.very_simple})
    glossary = {g.term: g.explanation for g in result.glossary if g.term.lower() in " ".join(sentences).lower()}
    return out, glossary


def explain(term: str, context: str, lang: str = "en") -> str:
    result: Explanation = _parse(
        f'Explain the word or phrase "{term}" as used in this sentence, in at most 20 plain '
        f"words, for someone listening by audio:\n\n{context}",
        Explanation,
        "You explain hard words in plain, respectful language for listeners. No brackets or symbols." + EXPLAIN_LANG.get(lang, ""),
        2000,
    )
    return result.explanation
