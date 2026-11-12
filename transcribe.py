"""Prints what is said in a WAV file. Runs on the CPU so it never competes with the GPU.

  transcribe.py <file.wav> [lang]   one file
  transcribe.py --serve             keeps the model loaded: reads "<file>\\t<lang>" lines, answers one JSON line each

"small" with the language fixed: base misheard short Spanish phrases and guessed the language wrong.
"""
import json, sys

from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
HINT = {"es": "Claudia, Claude Code, amor.", "en": "Claudia, Claude Code, love.", "pt": "Claudia, Claude Code, amor."}


def hear(path, lang):
    lang = lang or None
    segments, _ = model.transcribe(path, language=lang, vad_filter=True, beam_size=5, initial_prompt=HINT.get(lang or ""))
    return " ".join(segment.text.strip() for segment in segments).strip()


if sys.argv[1] == "--serve":
    for line in sys.stdin:
        path, _, lang = line.rstrip("\n").partition("\t")
        try:
            print(json.dumps({"text": hear(path, lang)}), flush=True)
        except Exception as error:  # a bad file must not take the server down
            print(json.dumps({"text": "", "error": str(error)}), flush=True)
else:
    print(hear(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
