"""Protected-facts guard.

Simplification must never drop numbers (doses, dates, amounts, phone numbers) or flip a
warning into permission. This module extracts those facts from the original sentence and
checks that every simplified level still carries them. A level that fails is marked
"unsure"; the app then warns the listener and offers the original instead.
"""
import re

_NUMBER_WORDS = {
    "one": "1", "once": "1", "two": "2", "twice": "2", "three": "3", "thrice": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "half": "0.5",
}
# A prohibition in the original ("do not", "stop") must survive as some negation in the
# simplified text, which may phrase it more loosely ("avoid", "skip", "without").
_PROHIBITION = re.compile(r"\b(not|never|no|don't|cannot|can't|won't|stop|discontinue)\b", re.I)
_NEGATIONS = re.compile(
    r"\b(not|never|no|don't|do not|cannot|can't|avoid|stop|discontinue|without|skip|unless|"
    r"must not|should not|won't|failure|unpaid|nothing|none|instead)\b",
    re.I,
)


_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_NUMBER_WORDS_HI = {
    "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पाँच": "5", "पांच": "5", "छह": "6", "छः": "6",
    "सात": "7", "आठ": "8", "नौ": "9", "दस": "10", "ग्यारह": "11", "बारह": "12", "आधा": "0.5", "आधी": "0.5",
}
# Hindi ways of keeping a warning: nahin, mat, kabhi nahin, band karen, rok, bina, bachen.
_NEG_HI = re.compile(r"(नहीं|नही|मत|बंद|रोक|बिना|बचें|बचना|मना)|(?:^|\s)(न|ना)(?=\s|$|[।,.])")


def numbers(text: str) -> set[str]:
    """Numeric facts as normalised strings: '2,340' -> '2340', 'twice' -> '2'."""
    text = text.translate(_DEVANAGARI_DIGITS)
    found = set()
    for m in re.finditer(r"\d[\d,]*(?:\.\d+)?", text):
        n = m.group().replace(",", "").rstrip(".")
        if "." in n:
            n = n.rstrip("0").rstrip(".")
        found.add(n.lstrip("0") or "0")
    for m in re.finditer(r"\b(" + "|".join(_NUMBER_WORDS) + r")\b(?!-)", text, re.I):
        found.add(_NUMBER_WORDS[m.group(1).lower()])
    # Hindi number words ("एक बार" = once, "दो" = two), as whole words only.
    for m in re.finditer(r"(?<![ऀ-ॿ])(" + "|".join(_NUMBER_WORDS_HI) + r")(?![ऀ-ॿ])", text):
        found.add(_NUMBER_WORDS_HI[m.group(1)])
    return found


def has_negation(text: str) -> bool:
    return bool(_NEGATIONS.search(text) or _NEG_HI.search(text))


def check(original: str, simplified: str) -> list[str]:
    """Return the protected facts from `original` that `simplified` lost (empty = safe)."""
    missing = []
    simple_nums = numbers(simplified)
    # Word numbers in the original are softer facts ("one of the"), so only digits are strict.
    for n in sorted(numbers(original)):
        if n not in simple_nums and re.search(r"\d", n):
            missing.append(n)
    if _PROHIBITION.search(original) and not has_negation(simplified):
        missing.append("a warning (not / never / stop)")
    return missing


def annotate(sentence: dict) -> dict:
    """Add `unsure: {level: [missing facts]}` to a sentence dict with level texts."""
    unsure = {}
    for level in ("light", "simple", "very_simple"):
        lost = check(sentence["original"], sentence.get(level) or "")
        if lost:
            unsure[level] = lost
    sentence["unsure"] = unsure
    return sentence
