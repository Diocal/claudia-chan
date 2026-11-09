"""Prints what is said in a WAV file. Runs on the CPU so it never competes with the GPU."""
import sys

from faster_whisper import WhisperModel

segments, _ = WhisperModel("base", device="cpu", compute_type="int8").transcribe(sys.argv[1], vad_filter=True)
print(" ".join(segment.text.strip() for segment in segments))
