"""SimpliSpeak prototype server.

    python server.py            # this computer: http://localhost:8000
    python server.py --mobile   # phones on the same Wi-Fi: https://<laptop-ip>:8443

AI keys are read from the environment or from a .env file next to this script:
    GEMINI_API_KEY=...       (preferred if present)
    ANTHROPIC_API_KEY=...
Without a key the app runs in offline mode: hand-written levels for the study samples and a
rule-based simplifier for new text.
"""
import argparse
import json
import os
import re
import socket
import ssl
import sys
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_env(path=ROOT / ".env"):
    """Minimal .env reader: KEY=VALUE lines; existing environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()

from simplispeak import guard, llm, rules  # noqa: E402  (after .env so model settings apply)
from simplispeak.segment import split_sentences, word_count  # noqa: E402

WEB = ROOT / "web"
DATA = ROOT / "study" / "data"
SAMPLES = json.loads((ROOT / "simplispeak" / "samples.json").read_text(encoding="utf-8"))
MAX_WORDS = 3000


# ---- AI answers are saved, so the same text, example or word never uses the daily AI quota twice ----
import hashlib  # noqa: E402
import threading  # noqa: E402

CACHE_FILE = ROOT / ".cache" / "ai_answers.json"
_cache_lock = threading.Lock()
try:
    _CACHE = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
except (OSError, ValueError):
    _CACHE = {}


def _ckey(*parts):
    return hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()


def _cache_put(key, value):
    with _cache_lock:
        _CACHE[key] = value
        try:
            CACHE_FILE.parent.mkdir(exist_ok=True)
            CACHE_FILE.write_text(json.dumps(_CACHE, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass


def cached_simplify(sentences, lang):
    key = _ckey("simplify", lang, *sentences)
    if key in _CACHE:
        hit = _CACHE[key]
        return [dict(s) for s in hit["levels"]], dict(hit["glossary"])
    levels, glossary = llm.simplify(sentences, lang)
    _cache_put(key, {"levels": levels, "glossary": glossary})
    return [dict(s) for s in levels], dict(glossary)


def cached_explain(term, context, lang):
    key = _ckey("explain", lang, term.lower(), context)
    if key in _CACHE:
        return _CACHE[key]
    text = llm.explain(term, context, lang)
    _cache_put(key, text)
    return text


def build_doc(title, sentences, glossary, engine, notice=""):
    sentences = [guard.annotate(dict(s)) for s in sentences]
    flagged = sum(1 for s in sentences if s["unsure"])
    return {
        "title": title,
        "sentences": sentences,
        "glossary": glossary,
        "engine": engine,
        "notice": notice,
        "words": sum(word_count(s["original"]) for s in sentences),
        "flagged": flagged,
    }


def sample_doc(sample_id):
    s = SAMPLES[sample_id]
    doc = build_doc(s["title"], s["sentences"], s["glossary"], "handwritten", s.get("note", ""))
    doc.update(id=s["id"], kind=s["kind"], questions=s.get("questions", []))
    return doc


def simplify_text(text, title, lang="en"):
    sentences = split_sentences(text)
    if not sentences:
        raise ValueError("I could not find any text to read.")
    if sum(word_count(s) for s in sentences) > MAX_WORDS:
        raise ValueError(f"This text is too long. Please use under {MAX_WORDS} words.")
    offline_glossary = rules.glossary_for(text)
    if llm.available():
        try:
            levels, glossary = cached_simplify(sentences, lang)
            if lang == "en":                            # the offline word list is in English
                for term, expl in offline_glossary.items():
                    if term.lower() not in {g.lower() for g in glossary}:
                        glossary[term] = expl
            doc = build_doc(title, levels, glossary, "ai")
            doc["lang"] = lang
            return doc
        except llm.AIUnavailable as e:
            notice = f"{e} Using offline simplification instead."
    else:
        notice = "Offline simplification (no AI key set). Quality is basic."
    if lang != "en":
        notice += " Hindi needs the AI, so this is in simple English."
    levels = [rules.simplify_sentence(s) for s in sentences]
    doc = build_doc(title, levels, offline_glossary, "offline", notice)
    doc["lang"] = "en"
    return doc


_SAMPLE_CACHE = {}


def sample_doc_lang(sample_id, lang):
    """A sample in another language: its original sentences, simplified by the AI (cached)."""
    if lang == "en" or not llm.available():
        doc = sample_doc(sample_id)
        doc["lang"] = "en"
        if lang != "en":
            doc["notice"] = "Hindi needs the AI, so this is in simple English. " + doc.get("notice", "")
        return doc
    key = (sample_id, lang)
    if key not in _SAMPLE_CACHE:
        s = SAMPLES[sample_id]
        try:
            levels, glossary = cached_simplify([x["original"] for x in s["sentences"]], lang)
        except llm.AIUnavailable as e:
            doc = sample_doc(sample_id)
            doc["lang"] = "en"
            doc["notice"] = f"{e} This is in simple English."
            return doc
        doc = build_doc(s["title"], levels, glossary, "ai", s.get("note", ""))
        doc.update(id=s["id"], kind=s["kind"], questions=s.get("questions", []), lang=lang)
        _SAMPLE_CACHE[key] = doc
    return json.loads(json.dumps(_SAMPLE_CACHE[key]))


def explain_term(term, context, lang="en"):
    term = term.strip()
    if llm.available():
        try:
            return {"explanation": cached_explain(term, context, lang), "source": "ai"}
        except llm.AIUnavailable:
            pass
    local = rules.explain(term)
    if local:
        return {"explanation": local, "source": "offline"}
    return {"explanation": None, "source": "none"}


class Server(ThreadingHTTPServer):
    """Threaded server where the HTTPS handshake happens in each connection's own thread.

    Wrapping the listening socket (the usual shortcut) runs every handshake in the accept loop, so one
    phone that opens a connection and abandons it (what a browser does around a certificate warning)
    freezes the whole server."""
    daemon_threads = True
    request_queue_size = 64
    ssl_context = None
    # On Windows SO_REUSEADDR lets a second copy bind the same port, so an old server keeps answering
    # with old code. Refuse instead.
    allow_reuse_address = os.name != "nt"

    def finish_request(self, request, client_address):
        if self.ssl_context is not None:
            try:
                request.settimeout(10)
                request = self.ssl_context.wrap_socket(request, server_side=True)
            except (ssl.SSLError, OSError):
                return                                   # abandoned or failed handshake: ignore
        try:
            super().finish_request(request, client_address)
        finally:
            try:
                request.close()
            except OSError:
                pass

    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], (ssl.SSLError, ConnectionError, TimeoutError, OSError)):
            return                                       # phones drop connections all the time
        super().handle_error(request, client_address)


class Handler(SimpleHTTPRequestHandler):
    timeout = 120

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s  %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, status=HTTPStatus.OK):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > (12_000_000 if self.path == "/api/ocr" else 2_000_000):
            raise ValueError("Request too large.")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        path, _, query = self.path.partition("?")
        lang = "hi" if "lang=hi" in query else "en"
        if path == "/api/status":
            from simplispeak import gemini
            note = gemini.quota_note() if llm.provider() is gemini else ""
            return self._json({"ai": llm.available(), "model": llm.name(), "note": note})
        if path == "/api/samples":
            return self._json([{"id": s["id"], "title": s["title"], "kind": s["kind"]} for s in SAMPLES.values()])
        m = re.fullmatch(r"/api/samples/(\w+)", path)
        if m:
            if m.group(1) not in SAMPLES:
                return self._json({"error": "No such sample."}, HTTPStatus.NOT_FOUND)
            return self._json(sample_doc_lang(m.group(1), lang))
        if path == "/api/study/sessions":
            DATA.mkdir(parents=True, exist_ok=True)
            return self._json([json.loads(p.read_text(encoding="utf-8")) for p in sorted(DATA.glob("*.json"))])
        return super().do_GET()

    def do_POST(self):
        try:
            body = self._body()
            if self.path == "/api/simplify":
                lang = "hi" if body.get("lang") == "hi" else "en"
                return self._json(simplify_text(body.get("text", ""), body.get("title") or "Your text", lang))
            if self.path == "/api/ocr":
                from simplispeak import gemini
                if not gemini.available():
                    return self._json({"error": "No AI key for photo reading."}, HTTPStatus.SERVICE_UNAVAILABLE)
                try:
                    return self._json({"text": gemini.ocr(body.get("image", ""), body.get("mime") or "image/jpeg")})
                except llm.AIUnavailable as e:
                    return self._json({"error": str(e)}, HTTPStatus.SERVICE_UNAVAILABLE)
            if self.path == "/api/explain":
                lang = "hi" if body.get("lang") == "hi" else "en"
                return self._json(explain_term(body.get("term", ""), body.get("context", ""), lang))
            if self.path == "/api/study/save":
                pid = re.sub(r"[^\w-]", "", str(body.get("participant", "")))[:32]
                if not pid:
                    raise ValueError("Missing participant ID.")
                DATA.mkdir(parents=True, exist_ok=True)
                (DATA / f"{pid}.json").write_text(json.dumps(body, indent=1, ensure_ascii=False), encoding="utf-8")
                return self._json({"saved": f"study/data/{pid}.json"})
            return self._json({"error": "Unknown endpoint."}, HTTPStatus.NOT_FOUND)
        except (ValueError, json.JSONDecodeError) as e:
            return self._json({"error": str(e)}, HTTPStatus.BAD_REQUEST)


def lan_ips():
    ips = set()
    primary = None
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sk:
            sk.connect(("8.8.8.8", 80))
            primary = sk.getsockname()[0]       # the address of the network actually in use
            ips.add(primary)
    except OSError:
        pass
    try:
        ips.update(i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
    except OSError:
        pass
    return sorted((ip for ip in ips if not ip.startswith("127.")), key=lambda ip: (ip != primary, ip))


def self_signed_cert(ips):
    """Create (once) a self-signed certificate so phones get HTTPS, which mic/camera need."""
    folder = ROOT / ".certs"
    cert, key = folder / "cert.pem", folder / "key.pem"
    if cert.exists() and key.exists():
        return str(cert), str(key)
    import datetime
    import ipaddress
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    folder.mkdir(exist_ok=True)
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SimpliSpeak prototype")])
    san = [x509.DNSName("localhost")] + [x509.IPAddress(ipaddress.ip_address(i)) for i in ips + ["127.0.0.1"]]
    now = datetime.datetime.now(datetime.timezone.utc)
    c = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(k.public_key())
         .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
         .not_valid_after(now + datetime.timedelta(days=365))
         .add_extension(x509.SubjectAlternativeName(san), critical=False).sign(k, hashes.SHA256()))
    key.write_bytes(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                    serialization.NoEncryption()))
    cert.write_bytes(c.public_bytes(serialization.Encoding.PEM))
    return str(cert), str(key)


def main():
    p = argparse.ArgumentParser(description="SimpliSpeak prototype server")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int)
    p.add_argument("--mobile", action="store_true", help="serve HTTPS on the local network for phones")
    p.add_argument("--cert")
    p.add_argument("--key")
    args = p.parse_args()
    ips = lan_ips()
    if args.mobile:
        args.host = "0.0.0.0"
        if not args.cert:
            args.cert, args.key = self_signed_cert(ips)
    port = args.port or (8443 if args.cert else 8000)
    try:
        httpd = Server((args.host, port), Handler)
    except OSError:
        sys.exit(f"Port {port} is already in use: SimpliSpeak is probably already running (close the other window), "
                 f"or start this one on another port with --port 8444.")
    scheme = "http"
    if args.cert:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(args.cert, args.key)
        httpd.ssl_context = ctx
        scheme = "https"
    mode = f"AI ({llm.name()})" if llm.available() else "offline (add GEMINI_API_KEY to .env for AI)"
    print(f"SimpliSpeak - simplification: {mode}")
    print(f"  On this computer:  {scheme}://localhost:{port}")
    if args.host == "0.0.0.0":
        for ip in ips:
            print(f"  On your phone:     {scheme}://{ip}:{port}")
        if ips:
            try:                                   # scan with the phone camera instead of typing
                import qrcode
                qr = qrcode.QRCode(border=1)
                qr.add_data(f"{scheme}://{ips[0]}:{port}")
                print("\n  Or scan this with your phone camera:\n")
                qr.print_ascii(invert=True)
            except Exception:
                pass
        if args.mobile:
            print("  Phone and laptop must be on the same Wi-Fi. The phone will warn that the")
            print("  certificate is not trusted: tap Advanced, then Proceed. If it will not load, allow")
            print("  Python through Windows Firewall (Private networks).")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
