"""Offline, rule-based simplifier.

Used when no Claude API key is configured or the network is down, so the prototype always
works in a demo or a test session. It is deliberately conservative: it swaps hard words for
plain ones (Light), then splits long sentences (Simple), then splits further and trims filler
(Very simple). Output quality is lower than the AI path; the guard still checks every level.
"""
import re

# term -> (plain replacement, short explanation). Keys are lower-case; multi-word first.
LEXICON: dict[str, tuple[str, str]] = {
    # health
    "administered orally": ("taken by mouth", "Swallowed, taken by mouth."),
    "adverse effects": ("side effects", "Unwanted effects a medicine can cause."),
    "adverse reactions": ("side effects", "Unwanted effects a medicine can cause."),
    "side effects": ("side effects", "Unwanted effects a medicine can cause, like a headache."),
    "seek immediate medical attention": ("get medical help right away", "Go to a doctor or hospital now."),
    "medical attention": ("medical help", "Help from a doctor or nurse."),
    "concomitant use": ("taking it together", "Taking two medicines at the same time."),
    "concomitant": ("at the same time", "Happening or taken at the same time."),
    "potassium-sparing diuretics": ("some water tablets", "Water tablets that keep potassium in your body."),
    "diuretics": ("water tablets", "Medicines that make you pass more urine."),
    "diuretic": ("water tablet", "A medicine that makes you pass more urine."),
    "hypertension": ("high blood pressure", "High blood pressure."),
    "hypotension": ("low blood pressure", "Low blood pressure."),
    "renal": ("kidney", "To do with the kidneys."),
    "hepatic": ("liver", "To do with the liver."),
    "cardiac": ("heart", "To do with the heart."),
    "impairment": ("problems", "When a part of the body does not work well."),
    "physician": ("doctor", "A doctor."),
    "pharmacist": ("pharmacist", "The person at the chemist who gives out medicine."),
    "dosage": ("dose", "How much medicine to take, and how often."),
    # "prescribed" is an adjective before a noun and a verb elsewhere: cover both readings so
    "your prescribed dosage": ("the dose your doctor gave you", "The amount of medicine your doctor told you to take."),
    "your prescribed dose": ("the dose your doctor gave you", "The amount of medicine your doctor told you to take."),
    "prescribed dosage": ("dose your doctor gave you", "The amount of medicine your doctor told you to take."),
    "prescribed dose": ("dose your doctor gave you", "The amount of medicine your doctor told you to take."),
    "as prescribed": ("as your doctor told you", "In the way your doctor told you."),
    "prescribed by": ("given by", "Ordered for you by."),
    "prescribed": ("given by your doctor", "Ordered for you by a doctor."),
    "persist": ("continue", "Keep going; do not go away."),
    "discontinue": ("stop", "Stop taking or using it."),
    "persistent": ("lasting", "Going on for a long time; not going away."),
    "indicated for": ("used for", "This is what the medicine is for."),
    "serum": ("blood", "The liquid part of your blood."),
    "elevated": ("raised", "Higher than normal."),
    "exceed": ("go over", "Go above a limit."),
    "exceeds": ("is more than", "Goes above a limit."),
    "exceeding": ("more than", "Going above a limit."),
    "consult": ("talk to", "Ask for advice from."),
    "symptoms": ("signs", "Changes in your body that show something is wrong."),
    "contraindicated": ("must not be used", "Not safe to use in this case."),
    "oral": ("by mouth", "Taken by mouth."),
    "orally": ("by mouth", "By mouth."),
    "daily": ("each day", "Every day."),
    # money and admin
    "pursuant to": ("after", "Because of, or following."),
    "periodic review": ("regular check", "A check done from time to time."),
    "periodic": ("regular", "Happening from time to time."),
    "kyc": ("ID check", "Know Your Customer: the bank checking who you are."),
    "re-verification": ("checking again", "Checking something again to make sure it is right."),
    "verification": ("check", "Checking that something is true."),
    "requisite": ("needed", "Needed or required."),
    "suspension": ("pause", "A stop for a while."),
    "debit transactions": ("taking money out", "Money going out of your account, like withdrawals or payments."),
    "credits": ("money coming in", "Money paid into your account."),
    "comprise": ("are", "Are made up of."),
    "electronically": ("online", "Using a computer or phone."),
    "one-time passcode": ("one-time code", "A short code sent to you that works only once."),
    "otp": ("one-time code", "A short code sent to you that works only once."),
    "remitted": ("paid", "Paid or sent."),
    "remit": ("pay", "Pay or send money."),
    "surcharge": ("extra fee", "An extra charge added to the bill."),
    "outstanding amount": ("amount you owe", "Money you still have to pay."),
    "outstanding": ("unpaid", "Not yet paid."),
    "consumption": ("use", "How much you used."),
    "subsidised threshold": ("cheaper limit", "The amount you can use at a lower price."),
    "subsidised": ("cheaper", "Partly paid for by the government, so it costs you less."),
    "threshold": ("limit", "A level or limit."),
    "slab rate": ("price level", "The price per unit for that band of use."),
    "consequently": ("so", "So, because of this."),
    "disconnected": ("cut off", "Switched off."),
    "authorised": ("approved", "Officially allowed."),
    "designated": ("official", "Chosen for this purpose."),
    "rebate": ("discount", "Money taken off the price."),
    "eligible": ("able to get", "Allowed to get something."),
    "inclusive of": ("including", "Including."),
    "applicable": ("relevant", "That apply to you."),
    "utility": ("supply company", "A company that supplies power, water or gas."),
    "upi": ("UPI", "A way to pay from your phone straight from your bank account."),
    # general register
    "we are writing to inform you that": ("we want to tell you that", ""),
    "please note that": ("note:", ""),
    "in the event that": ("if", ""),
    "prior to": ("before", "Before."),
    "subsequent to": ("after", "After."),
    "in accordance with": ("following", "Following, by the rules of."),
    "commence": ("start", "Start."),
    "terminate": ("end", "End or stop."),
    "approximately": ("about", "About; not exact."),
    "sufficient": ("enough", "Enough."),
    "facilitate": ("help", "Make easier."),
    "obtain": ("get", "Get."),
    "utilise": ("use", "Use."),
    "utilize": ("use", "Use."),
    "assistance": ("help", "Help."),
    "require": ("need", "Need."),
    "requires": ("needs", "Needs."),
    "submit": ("send", "Send or hand in."),
    "submitted": ("sent", "Sent or handed in."),
    "result in": ("cause", "Cause."),
    "regarding": ("about", "About."),
    "additional": ("more", "More, extra."),
    "notify": ("tell", "Tell."),
    "individuals": ("people", "People."),
    "preferably": ("ideally", "If possible."),
    "should the": ("if the", ""),
}

_TERMS = sorted(LEXICON, key=len, reverse=True)
_TERM_RE = re.compile(r"(?<![\w-])(" + "|".join(re.escape(t) for t in _TERMS) + r")(?![\w-])", re.I)

# Places where a long sentence can be cut into two without changing meaning.
_SPLITS = [
    r";\s+",
    r",\s+(?:and|but|so|or)\s+(?=(?:you|it|we|they|your|this|the|if)\b)",
    r"\s+(?=unless\b)",
    r"\s+(?=if\b)",
    r",\s+(?=(?:which|who)\b)",
    r":\s+",
]
_FILLER = [r"\bplease\b\s*", r"\bkindly\b\s*", r"\bnote:\s*", r"\bin order to\b", r"\bat this time\b"]


def _match_case(src: str, rep: str) -> str:
    return rep[:1].upper() + rep[1:] if src[:1].isupper() else rep


def light(sentence: str) -> str:
    def sub(m):
        rep = LEXICON[m.group(1).lower()][0]
        return _match_case(m.group(1), rep)
    out = _TERM_RE.sub(sub, sentence)
    out = re.sub(r"\(\s*([^)]*)\)", r", \1,", out)       # parentheses are hard to hear
    out = re.sub(r"\s+,", ",", out)
    out = re.sub(r",\s*([;:])", r"\1", out)
    out = re.sub(r",\s*([.!?])", r"\1", out)
    return re.sub(r"\s{2,}", " ", out).strip()


def _sentence_case(part: str) -> str:
    part = part.strip(" ,;:")
    if not part:
        return ""
    part = part[0].upper() + part[1:]
    if part[-1] not in ".!?":
        part += "."
    return part


def _split(sentence: str, patterns, max_words: int) -> list[str]:
    parts = [sentence]
    for pat in patterns:
        nxt = []
        for p in parts:
            if len(p.split()) > max_words:
                nxt.extend(x for x in re.split(pat, p, flags=re.I) if x.strip())
            else:
                nxt.append(p)
        parts = nxt
    return [_sentence_case(p) for p in parts if _sentence_case(p)]


def simple(sentence: str) -> str:
    return " ".join(_split(light(sentence), _SPLITS, 12))


def very_simple(sentence: str) -> str:
    text = light(sentence)
    for f in _FILLER:
        text = re.sub(f, "", text, flags=re.I)
    parts = _split(text, _SPLITS + [r",\s+(?=(?:or|and)\b)", r",\s+"], 8)
    return " ".join(parts)


def simplify_sentence(sentence: str) -> dict:
    return {"original": sentence, "light": light(sentence), "simple": simple(sentence),
            "very_simple": very_simple(sentence)}


def glossary_for(text: str) -> dict[str, str]:
    found = {}
    for m in _TERM_RE.finditer(text):
        term = m.group(1).lower()
        expl = LEXICON[term][1]
        if expl:
            found[m.group(1)] = expl
    return found


def explain(word: str) -> str | None:
    entry = LEXICON.get(word.lower().strip(" .,?!"))
    return entry[1] if entry and entry[1] else None
