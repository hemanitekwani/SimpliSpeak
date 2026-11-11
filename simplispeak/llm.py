"""Pick the AI provider: Gemini if GEMINI_API_KEY is set, else Claude if ANTHROPIC_API_KEY is set."""
from . import ai, gemini
from .prompts import AIUnavailable  # noqa: F401  (re-exported for server.py)


def provider():
    if gemini.available():
        return gemini
    if ai.available():
        return ai
    return None


def available():
    return provider() is not None


def name():
    p = provider()
    return None if p is None else ("Gemini " if p is gemini else "Claude ") + p.MODEL


def simplify(sentences, lang="en"):
    return provider().simplify(sentences, lang)


def explain(term, context, lang="en"):
    return provider().explain(term, context, lang)
