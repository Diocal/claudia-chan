# Local, free text-to-speech with Kokoro (ONNX, CPU). usage: tts_kokoro.py <voice> <lang> <speed> <out.wav>  (text on stdin)
# <voice> is one Kokoro voice (ef_dora) or a blend that makes a new one: "af_bella:0.6+jf_nezumi:0.4".
import sys, os
import soundfile as sf
from kokoro_onnx import Kokoro
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "vendor/kokoro/model")
voice, lang, speed, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
text = sys.stdin.read().strip()
kokoro = Kokoro(os.path.join(MODEL, "kokoro-v1.0.int8.onnx"), os.path.join(MODEL, "voices-v1.0.bin"))
if "+" in voice or ":" in voice:
    parts = [p.split(":") for p in voice.split("+")]
    total = sum(float(w) for _, w in parts)
    voice = sum(kokoro.get_voice_style(name) * (float(w) / total) for name, w in parts)
samples, rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
sf.write(out, samples, rate)
