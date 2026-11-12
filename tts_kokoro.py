# Local, free text-to-speech with Kokoro (ONNX, CPU). usage: tts_kokoro.py <voice> <lang> <speed> <out.wav>  (text on stdin)
import sys, os
import soundfile as sf
from kokoro_onnx import Kokoro
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "vendor/kokoro/model")
voice, lang, speed, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
text = sys.stdin.read().strip()
kokoro = Kokoro(os.path.join(MODEL, "kokoro-v1.0.int8.onnx"), os.path.join(MODEL, "voices-v1.0.bin"))
samples, rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
sf.write(out, samples, rate)
