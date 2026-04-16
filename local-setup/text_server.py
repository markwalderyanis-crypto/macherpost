#!/usr/bin/env python3
"""
text_server.py — lokaler Text-Server fuer MacherPost.

Wrappt Ollama (http://localhost:11434) so dass die exakte API rauskommt,
die pipeline/providers/text.js erwartet.

API:
    POST /generate
        Body : { "system": str, "user": str,
                 "max_tokens": int, "model": str?, "temperature": float? }
        Antw.: { "text": str, "model": str, "elapsed_s": float }

    GET /health
        Antw.: { "status": "ok", "models": [...], "default_model": str }

Start:
    python text_server.py
    # oder mit eigenem Modell:
    set MACHERPOST_DEFAULT_MODEL=gemma4:12b
    python text_server.py

Dependencies:
    pip install flask requests
"""
import json
import os
import sys
import time
from flask import Flask, jsonify, request
import requests

# ── Konfiguration ────────────────────────────────────────────────────────
OLLAMA_URL      = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL   = os.environ.get("MACHERPOST_DEFAULT_MODEL", "gemma4:12b")
LISTEN_HOST     = os.environ.get("MACHERPOST_TEXT_HOST", "127.0.0.1")
LISTEN_PORT     = int(os.environ.get("MACHERPOST_TEXT_PORT", "5578"))
REQUEST_TIMEOUT = int(os.environ.get("MACHERPOST_TEXT_TIMEOUT", "1800"))  # 30 Min/Request

app = Flask(__name__)


def _ollama_models():
    """Liste der lokal verfuegbaren Ollama-Modelle (oder leere Liste)."""
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except Exception as e:
        print(f"[health] Ollama nicht erreichbar: {e}", file=sys.stderr)
        return []


@app.get("/health")
def health():
    models = _ollama_models()
    ok = bool(models)
    return jsonify({
        "status": "ok" if ok else "degraded",
        "models": models,
        "default_model": DEFAULT_MODEL,
        "ollama_url": OLLAMA_URL,
    }), (200 if ok else 503)


@app.post("/generate")
def generate():
    payload = request.get_json(silent=True) or {}
    system  = payload.get("system", "")
    user    = payload.get("user", "")
    if not user:
        return jsonify({"error": "user prompt fehlt"}), 400

    model       = payload.get("model") or DEFAULT_MODEL
    max_tokens  = int(payload.get("max_tokens") or 8192)
    temperature = float(payload.get("temperature") if payload.get("temperature") is not None else 0.7)

    # Ollama /api/chat — am robustesten fuer system + user
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": temperature,
        },
    }

    started = time.time()
    try:
        r = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=body,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.ConnectionError as e:
        return jsonify({"error": f"Ollama nicht erreichbar ({OLLAMA_URL}): {e}"}), 502
    except requests.exceptions.Timeout:
        return jsonify({"error": f"Ollama Timeout nach {REQUEST_TIMEOUT}s"}), 504

    if not r.ok:
        return jsonify({"error": f"Ollama HTTP {r.status_code}: {r.text[:300]}"}), 502

    try:
        data = r.json()
    except json.JSONDecodeError:
        return jsonify({"error": "Ollama lieferte kein JSON"}), 502

    # Ollama Antwort: {"message": {"role":"assistant","content":"..."}, ...}
    text = (data.get("message") or {}).get("content") or data.get("response") or ""
    if not text:
        return jsonify({"error": "Ollama lieferte leeren Text", "raw": data}), 502

    elapsed = round(time.time() - started, 2)
    print(f"[gen] model={model} max_tokens={max_tokens} -> "
          f"{len(text.split())} Woerter in {elapsed}s")

    return jsonify({
        "text": text,
        "model": model,
        "elapsed_s": elapsed,
    })


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "not found",
                    "endpoints": ["GET /health", "POST /generate"]}), 404


if __name__ == "__main__":
    print("─" * 60)
    print(f"  MacherPost Text-Server")
    print(f"  Listen   : http://{LISTEN_HOST}:{LISTEN_PORT}")
    print(f"  Ollama   : {OLLAMA_URL}")
    print(f"  Default  : {DEFAULT_MODEL}")
    print(f"  Timeout  : {REQUEST_TIMEOUT}s pro Request")
    print("─" * 60)
    print("  Health-Check: curl http://127.0.0.1:%d/health" % LISTEN_PORT)
    print("─" * 60)
    # threaded=True damit /health waehrend laufender Generierung antwortet
    app.run(host=LISTEN_HOST, port=LISTEN_PORT, threaded=True, debug=False)
