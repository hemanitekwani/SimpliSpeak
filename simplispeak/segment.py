"""Split source text into short listenable parts (sentences)."""
import re

# Abbreviations that end with a dot but do not end a sentence.
# Titles and the like never end a sentence ("Dr. Rao", "Rs. 500", "No. 4"). Units such as "mg." or
# "etc." can end one ("Take 10 mg. Do not drive."), so they are not listed here.
_ABBREV = {"dr", "mr", "mrs", "ms", "no", "vs", "e.g", "i.e", "approx", "st", "rs", "prof", "smt", "shri"}

_WS = re.compile(r"\s+")


def clean(text: str) -> str:
    text = text.replace("­", "")              # soft hyphens from PDFs
    text = re.sub(r"-\n(\w)", r"\1", text)         # words broken across lines (common in OCR)
    text = re.sub(r"[ \t]*\n[ \t]*\n+", "\n\n", text)
    return text.strip()


def split_sentences(text: str) -> list[str]:
    """Split on sentence punctuation and paragraph breaks, keeping abbreviations intact."""
    text = clean(text)
    out: list[str] = []
    for para in re.split(r"\n\s*\n|\n(?=[-•*]\s)", text):
        para = _WS.sub(" ", para).strip(" -•*")
        if not para:
            continue
        start = 0
        for m in re.finditer(r"[.!?।]+[\"')\]]?(?=\s+[A-Z0-9\"'(\u0900-\u097F])", para):
            end = m.end()
            word = re.findall(r"([\w.]+)[.!?]+[\"')\]]?$", para[start:end])
            if word and word[0].lower().rstrip(".") in _ABBREV:
                continue
            piece = para[start:end].strip()
            if piece:
                out.append(piece)
            start = end
        tail = para[start:].strip()
        if tail:
            out.append(tail)
    return out


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'’-]+\b", text))
