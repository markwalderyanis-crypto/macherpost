#!/usr/bin/env python3
"""
generate-test-clips.py — Generiert 20 Test-Videoclips via ComfyUI API.

Voraussetzungen:
  1. ComfyUI laeuft (run_nvidia_gpu.bat) auf http://localhost:8188
  2. HunyuanVideo-Modell ist in ComfyUI installiert
     (Manager -> Install Models -> HunyuanVideo suchen -> Download)

Start:
  python generate-test-clips.py

Ausgabe: 20 Clips in ./video-test-output/
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

COMFYUI_URL = "http://127.0.0.1:8188"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "video-test-output")
PROMPTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "video-test-prompts.json")

# HunyuanVideo ComfyUI Workflow — API format
# Passt sich an verfuegbare Modelle an
def build_workflow(prompt_text, negative_prompt, clip_id):
    """Baut einen ComfyUI API-Workflow fuer HunyuanVideo."""
    workflow = {
        "1": {
            "class_type": "HunyuanVideoTextEncode",
            "inputs": {
                "prompt": prompt_text,
                "force_offload": True
            }
        },
        "2": {
            "class_type": "HunyuanVideoTextEncode",
            "inputs": {
                "prompt": negative_prompt,
                "force_offload": True
            }
        },
        "3": {
            "class_type": "HunyuanVideoSampler",
            "inputs": {
                "width": 1280,
                "height": 720,
                "num_frames": 81,
                "steps": 30,
                "embedded_guidance_scale": 6.0,
                "flow_shift": 7.0,
                "seed": clip_id * 12345,
                "positive": ["1", 0],
                "negative": ["2", 0],
                "force_offload": True
            }
        },
        "4": {
            "class_type": "HunyuanVideoDecode",
            "inputs": {
                "samples": ["3", 0],
                "force_offload": True
            }
        },
        "5": {
            "class_type": "SaveAnimatedWEBP",
            "inputs": {
                "filename_prefix": f"macherpost-test-{clip_id:02d}",
                "fps": 8,
                "quality": 90,
                "images": ["4", 0]
            }
        }
    }
    return workflow


def check_comfyui():
    """Prueft ob ComfyUI laeuft."""
    try:
        req = urllib.request.urlopen(f"{COMFYUI_URL}/system_stats", timeout=5)
        return req.status == 200
    except Exception:
        return False


def queue_prompt(workflow):
    """Sendet einen Workflow an ComfyUI."""
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read().decode("utf-8"))


def get_queue_size():
    """Anzahl wartende/laufende Jobs."""
    try:
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/queue", timeout=5)
        data = json.loads(resp.read().decode("utf-8"))
        running = len(data.get("queue_running", []))
        pending = len(data.get("queue_pending", []))
        return running + pending
    except Exception:
        return -1


def main():
    print("=" * 60)
    print("  MacherPost Video-Test — 20 Clips generieren")
    print("=" * 60)

    # Check ComfyUI
    if not check_comfyui():
        print(f"\n  ComfyUI nicht erreichbar ({COMFYUI_URL})")
        print("  Bitte zuerst run_nvidia_gpu.bat starten.")
        sys.exit(1)
    print(f"\n  ComfyUI laeuft auf {COMFYUI_URL}")

    # Load prompts
    with open(PROMPTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    prompts = data["prompts"]
    negative = data["negative_prompt"]
    print(f"  {len(prompts)} Prompts geladen")

    # Queue all prompts
    print(f"\n  Starte Generierung (je ~2-5 Min pro Clip auf RTX 5060 Ti)...")
    print(f"  Geschaetzte Gesamtdauer: 40-100 Minuten")
    print(f"  Ausgabe in ComfyUI output-Ordner\n")

    for i, p in enumerate(prompts):
        print(f"  [{i+1:2d}/20] {p['category']:12s} | {p['prompt'][:60]}...")
        try:
            workflow = build_workflow(p["prompt"], negative, p["id"])
            result = queue_prompt(workflow)
            prompt_id = result.get("prompt_id", "?")
            print(f"           -> Queued (ID: {prompt_id})")
        except Exception as e:
            print(f"           -> FEHLER: {e}")

        # Nicht alles auf einmal — warte bis Queue < 3
        while get_queue_size() >= 3:
            time.sleep(10)

    # Warte bis alles fertig
    print("\n  Alle 20 in Queue. Warte auf Abschluss...")
    while get_queue_size() > 0:
        qs = get_queue_size()
        print(f"  ... {qs} Jobs noch aktiv", end="\r")
        time.sleep(15)

    print("\n")
    print("=" * 60)
    print("  FERTIG! 20 Clips generiert.")
    print(f"  Ausgabe: ComfyUI/output/ Ordner")
    print(f"  Dateinamen: macherpost-test-01.webp bis -20.webp")
    print("=" * 60)


if __name__ == "__main__":
    main()
