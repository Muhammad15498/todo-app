import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from flask import Flask, Response, jsonify, render_template, request, send_from_directory

app = Flask(__name__, static_folder="static", template_folder="templates")


def _fetch(url, timeout=12):
    req = Request(
        url,
        headers={
            "User-Agent": "GlossReader/1.0 (contextual reading companion)",
            "Accept": "application/json",
        },
    )
    with urlopen(req, timeout=timeout) as res:
        return res.read(), res.status, res.headers.get("Content-Type", "application/json")


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    return {"ok": True}


@app.route("/sw.js")
def service_worker():
    return send_from_directory("static", "sw.js", mimetype="application/javascript")


@app.route("/api/dictionary/<path:word>")
def dictionary(word):
    url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + quote(word)
    try:
        data, status, mime = _fetch(url)
        return Response(data, status=status, mimetype=mime)
    except HTTPError as err:
        return Response(err.read(), status=err.code, mimetype="application/json")
    except (URLError, TimeoutError, OSError) as err:
        return jsonify({"error": str(err)}), 502


@app.route("/api/wiki/<path:word>")
def wiki(word):
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + quote(word)
    try:
        data, status, mime = _fetch(url)
        return Response(data, status=status, mimetype=mime)
    except HTTPError as err:
        return Response(err.read(), status=err.code, mimetype="application/json")
    except (URLError, TimeoutError, OSError) as err:
        return jsonify({"error": str(err)}), 502


@app.post("/api/explain")
def explain():
    body = request.get_json(silent=True) or {}
    key = (body.get("key") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    model = (body.get("model") or "gemini-2.5-flash").strip()
    if not key or not prompt:
        return jsonify({"error": "Missing key or prompt"}), 400
    if not re.match(r"^[a-zA-Z0-9._-]+$", model):
        model = "gemini-2.5-flash"
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + model
        + ":generateContent?key="
        + quote(key)
    )
    payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
    req = Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "GlossReader/1.0",
        },
    )
    try:
        with urlopen(req, timeout=45) as res:
            data = json.loads(res.read().decode("utf-8"))
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text")
            or ""
        )
        return jsonify({"text": text})
    except HTTPError as err:
        try:
            detail = json.loads(err.read().decode("utf-8"))
            msg = detail.get("error", {}).get("message") or str(err)
        except Exception:
            msg = str(err)
        return jsonify({"error": msg}), err.code if err.code else 502
    except (URLError, TimeoutError, OSError) as err:
        return jsonify({"error": str(err)}), 502


@app.route("/api/translate")
def translate():
    q = (request.args.get("q") or "").strip()
    lang = (request.args.get("lang") or "en").strip()
    if not q or lang == "en":
        return jsonify({"translated": q})
    url = (
        "https://api.mymemory.translated.net/get?q="
        + quote(q[:450])
        + "&langpair=en|"
        + quote(lang)
    )
    try:
        data, *_ = _fetch(url)
        payload = json.loads(data.decode("utf-8"))
        translated = (
            payload.get("responseData", {}).get("translatedText")
            or payload.get("matches", [{}])[0].get("translation")
            or ""
        )
        return jsonify({"translated": translated})
    except Exception as err:
        return jsonify({"translated": "", "error": str(err)}), 502


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
