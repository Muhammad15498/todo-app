import json
import os
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
