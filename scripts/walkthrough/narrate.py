"""Walkthrough narration with an open-source voice model, offline.

Kokoro-82M (Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M) through
kokoro-onnx (MIT). Nothing is sent anywhere. (Adapted from the sibling
project Upbeat.)

    pip install kokoro-onnx soundfile
    # model files: kokoro-v1.0.onnx and voices-v1.0.bin from
    # https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0)
    python scripts/walkthrough/narrate.py <lines.json> <out-dir> <model-dir> [voice] [speed]

lines.json: [{"id": "n01", "text": "..."}, ...]  ->  <out-dir>/n01.wav ...
Default voice: am_michael (US English, male).
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

lines_path, out_dir, model_dir = sys.argv[1:4]
voice = sys.argv[4] if len(sys.argv) > 4 else "am_michael"
speed = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
os.makedirs(out_dir, exist_ok=True)
tts = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
with open(lines_path, encoding="utf-8") as f:
    lines = json.load(f)
for line in lines:
    samples, rate = tts.create(line["text"], voice=voice, speed=speed, lang="en-us")
    sf.write(os.path.join(out_dir, f"{line['id']}.wav"), samples, rate)
    print(f"{line['id']}: {len(samples) / rate:.1f} s")
