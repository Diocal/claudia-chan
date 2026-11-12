# Claudia-chan

Claude Code as an anime companion: a Claude Code plugin plus a floating 3D avatar with voice, moods and customization.

## Install

    ./setup.sh
    claude-chan

Needs Claude Code, Node, `uv`, `ffmpeg` and an X11 desktop (Ubuntu/Debian), macOS with Homebrew, or Windows. On macOS, allow microphone access for your terminal the first time you talk to her.

On **Windows** (PowerShell):

    winget install OpenJS.NodeJS.LTS astral-sh.uv Gyan.FFmpeg
    powershell -ExecutionPolicy Bypass -File setup.ps1
    claude-chan

Windows uses Kokoro for her voice (the old Japanese voice is Linux/macOS only); set `micWin` in `config.json` if she picks the wrong microphone.

`setup.sh` only writes inside this folder plus the `claude-chan` launcher in `~/.local/bin`. Plain `claude` keeps working as usual.

## Living with her

- She works alongside Claude: typing at her laptop while it writes, reading while it looks, nervous while tests run, cheering when they pass.
- On her own she strolls along the bottom of the screen, sits on top of the window you are using (X11) and sometimes dances. `/claudia pasear off` keeps her still.
- She remembers what you tell her (her diary lives in the plugin store), misses you when you are away and gets jealous of other AIs.
- `/claudia baila`, `/claudia beso`, `/claudia panel`, `/claudia help` for the rest.
- Tray icon: hide/show (Ctrl+Alt+H), talk (Ctrl+Alt+V), move (Ctrl+Alt+C), dance, kiss, settings, close.

## Voice

- Default: **Kokoro**, a natural voice that runs locally and free (`/claudia voz kokoro`).
- Optional: **ElevenLabs** (`/claudia voz elevenlabs`), the most expressive. Put your key in `~/.config/claudia-chan/elevenlabs.key` (or `ELEVENLABS_API_KEY`); it uses the voice "Unya" and falls back to Kokoro if the key is missing or the call fails.
- Talk to her with Ctrl+Alt+V: Whisper transcribes on your machine and your Claude Code session answers, on your Claude subscription. While you chat she reads her whole reply aloud.

## VR and mixed reality

Turn on "Verla en VR / realidad mixta" in the panel (Comportamiento) and open the link it shows in your headset's browser (Quest and other WebXR headsets, same WiFi). She stands in your room (passthrough) or in a soft room, at full size, with everything she does on the desktop; hold a controller trigger to talk. The link carries a key, the server is HTTPS with a self-signed certificate (accept it once) and it only serves the VR page. On this PC you can preview it at http://127.0.0.1:8971/vr.

## Layout

- `plugin/`: the Claude Code plugin (persona, `/claudia` command, reactions).
- Project root: the Electron avatar window, on loopback port 8971.
- `assets/models/`: extra characters. Export a `.vrm` from VRoid Studio, place it here and pick it with `/claudia modelo <name>` or `/claudia panel`.

## Credits

- Default model: VRM sample by pixiv.
- `assets/models/vita.vrm`, `hairsample-female.vrm`, `darkness-shibu.vrm`: CC0 (license embedded in each file).
- Voice: Kokoro-82M (Apache-2.0) via kokoro-onnx; Open JTalk with the Mei voice from MMDAgent (Nagoya Institute of Technology, CC BY).
