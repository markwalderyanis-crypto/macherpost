#!/usr/bin/env python3
"""
image_server.py — lokaler Bild-Server fuer MacherPost (Referenz-Implementation).

Falls du auf C:\\Users\\setup\\Favorites\\Links\\image_server.py bereits einen
Server hast, der die unten beschriebene API erfuellt — perfekt, lass den.
Falls nicht: dieser hier nutzt diffusers + SDXL.

API:
    POST /generate (Header: Authorization: Bearer <token>)
        Body : { "prompt": str, "width": int?, "height": int?,
                 "steps": int?, "negative_prompt": str? }
        Antw.: PNG-Binary  (Content-Type: image/png)

    GET /health (Header: Authorization: Bearer <token>)
        Antw.: { "status": "ok", "model": "stabilityai/stable-diffusion-xl-base-1.0" }

Start:
    set MACHERPOST_IMAGE_TOKEN=mpost-img-2026
    python image_server.py

Dependencies (Erstinstallation, ca. 8 GB Download):
    pip install flask torch --index-url https://download.pytorch.org/whl/cu121
    pip install diffusers transformers accelerate safetensors
"""
import io
import os
import sys
import time
from flask import Flask, jsonify, request, send_file

# ── Konfiguration ────────────────────────────────────────────────────────
LISTEN_HOST  = os.environ.get("MACHERPOST_IMAGE_HOST", "127.0.0.1")
LISTEN_PORT  = int(os.environ.get("MACHERPOST_IMAGE_PORT", "5577"))
AUTH_TOKEN   = os.environ.get("MACHERPOST_IMAGE_TOKEN", "mpost-img-2026")
MODEL_ID     = os.environ.get("MACHERPOST_IMAGE_MODEL",
                              "stabilityai/stable-diffusion-xl-base-1.0")
DEVICE       = os.environ.get("MACHERPOST_IMAGE_DEVICE", "cuda")  # "cuda" oder "cpu"

app = Flask(__name__)
_pipe = None  # Lazy-Init nach erstem Request


def _check_auth():
    auth = request.headers.get("Authorization", "")
    expected = f"Bearer {AUTH_TOKEN}"
    return auth == expected


def _load_pipeline():
    """SDXL-Pipeline beim ersten Aufruf laden — das spart RAM beim /health."""
    global _pipe
    if _pipe is not None:
        return _pipe
    print(f"[init] Lade {MODEL_ID} auf {DEVICE} ... (kann beim 1. Mal ein paar Min dauern)")
    import torch
    from diffusers import StableDiffusionXLPipeline

    dtype = torch.float16 if DEVICE == "cuda" else torch.float32
    _pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL_ID, torch_dtype=dtype, use_safetensors=True
    )
    _pipe = _pipe.to(DEVICE)
    # VRAM sparen — kannst du auskommentieren wenn du genug Karte hast
    try:
        _pipe.enable_attention_slicing()
    except Exception:
        pass
    print("[init] Pipeline geladen.")
    return _pipe


@app.get("/health")
def health():
    if not _check_auth():
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({
        "status": "ok",
        "model": MODEL_ID,
        "device": DEVICE,
        "loaded": _pipe is not None,
    })


@app.post("/generate")
def generate():
    if not _check_auth():
        return jsonify({"error": "unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    prompt  = payload.get("prompt") or ""
    if not prompt:
        return jsonify({"error": "prompt fehlt"}), 400

    width   = int(payload.get("width")  or 1280)
    height  = int(payload.get("height") or 720)
    steps   = int(payload.get("steps")  or 30)
    neg     = payload.get("negative_prompt") or "text, watermark, logo, signature, low quality, blurry"

    # Auf SDXL-faehige Aufloesung runden (Vielfache von 8)
    width  = (width  // 8) * 8
    height = (height // 8) * 8

    started = time.time()
    try:
        pipe = _load_pipeline()
        result = pipe(
            prompt=prompt,
            negative_prompt=neg,
            width=width,
            height=height,
            num_inference_steps=steps,
        )
        image = result.images[0]
    except Exception as e:
        return jsonify({"error": f"Generierung fehlgeschlagen: {e}"}), 500

    elapsed = round(time.time() - started, 2)
    print(f"[gen] {width}x{height} steps={steps} -> {elapsed}s")

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png", download_name="image.png")


if __name__ == "__main__":
    print("─" * 60)
    print(f"  MacherPost Image-Server")
    print(f"  Listen : http://{LISTEN_HOST}:{LISTEN_PORT}")
    print(f"  Token  : {'(gesetzt)' if AUTH_TOKEN else 'KEINER'}")
    print(f"  Model  : {MODEL_ID}")
    print(f"  Device : {DEVICE}")
    print("─" * 60)
    print(f"  Health: curl -H 'Authorization: Bearer {AUTH_TOKEN}' "
          f"http://127.0.0.1:{LISTEN_PORT}/health")
    print("─" * 60)
    app.run(host=LISTEN_HOST, port=LISTEN_PORT, threaded=False, debug=False)
