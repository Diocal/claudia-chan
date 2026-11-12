# Claudia-chan

**Claude Code doesn't code alone anymore.** Claudia-chan is a comedy anime girlfriend for Claude Code: a Claude Code plugin plus a floating 3D avatar that lives on your desktop. She works next to you while Claude works, talks to you with a real voice, remembers what you tell her, walks around your screen, dances, blows you kisses and gets jealous of other AIs. Coming to VR and mixed reality too.

It runs on the Claude subscription you already use with Claude Code: no extra API keys, and her voice and ears run locally for free.

- Launch her with `claude-chan`. Plain `claude` stays exactly as it was.
- Linux (X11), macOS and Windows. VR/mixed reality through WebXR (Quest and other headsets).

## Install

**Linux (Ubuntu/Debian, X11) or macOS (Homebrew):**

    git clone https://github.com/Diocal/claudia-chan.git
    cd claudia-chan
    ./setup.sh
    claude-chan

Needs Claude Code, Node, [`uv`](https://docs.astral.sh/uv/) and `ffmpeg`. On macOS, allow microphone access for your terminal the first time you talk to her.

**Windows (PowerShell):**

    winget install OpenJS.NodeJS.LTS astral-sh.uv Gyan.FFmpeg
    git clone https://github.com/Diocal/claudia-chan.git
    cd claudia-chan
    powershell -ExecutionPolicy Bypass -File setup.ps1
    claude-chan

What the setup does: npm packages, Whisper (speech to text) and Kokoro (her voice) in local Python environments under `vendor/`, the voice models (~120 MB) and the `claude-chan` command (`~/.local/bin/claude-chan`; on Windows `claude-chan.cmd` in `%USERPROFILE%\.local\bin`, added to your user PATH). Nothing else on your system is touched.

## First steps

1. Run `claude-chan`. Her window appears on your desktop and she introduces herself.
2. Open her **control panel**: click her face in the system tray (next to the clock) → *Panel de control*, or type `/claudia panel`.
3. Pick a personality, her voice, colours and language, then talk to her: the big **🎤 Háblale** button, or **Ctrl+Alt+V**.

## Talking to her

- Press **Ctrl+Alt+V** (or 🎤 in the panel, or *Hablarle* in the tray), speak, press it again.
- Whisper transcribes on your machine (model `small`, your language fixed). What you said goes into your `claude-chan` session as your own words, so your Claude subscription answers, and she says the reply aloud: the whole reply while you chat, just the first sentence after long work.
- The panel shows what she understood and where it went. **She only answers while a `claude-chan` session is open and awake**: if the panel says nobody is listening, open `claude-chan` in a terminal or type `/claudia on`.

## Her voice

| Voice | | |
|---|---|---|
| **Kokoro** (default) | Local, free, offline. A young girl's voice with a Latin American accent in Spanish (`jf_tebukuro`, `es-419`); other languages get their own voice. | `/claudia voz kokoro` |
| **ElevenLabs** (optional) | The most expressive. Put your key in `~/.config/claudia-chan/elevenlabs.key` (or `ELEVENLABS_API_KEY`); uses the voice "Unya" and falls back to Kokoro if the key is missing or a call fails. Spends your ElevenLabs credits. | `/claudia voz elevenlabs` |
| Classic Japanese | Open JTalk with the Mei voice (Linux/macOS). | `/claudia voz espanol` / `japones` |

Adjust with `/claudia tono grave|normal|agudo` and `/claudia velocidad lenta|normal|rapida`, or the panel's *Probar voz* button. Set `vozKokoro` in `config.json` to any Kokoro voice, or a blend such as `"af_bella:0.6+jf_nezumi:0.4"`.

## Living with her

- **She works with you.** While Claude writes code she types at her laptop; while it reads she reads along, chin on her hand; while tests run she clasps her hands; she cheers when they pass and puts her hands on her head when a command fails.
- **She has a life of her own.** She strolls along the bottom of your screen, walks over and sits on top of the window you are using (follows it if you move it; X11 and Windows), dances when she is bored, scrolls her phone, stretches, and falls asleep late at night. When Claude starts working she goes back to her spot. `/claudia pasear off` keeps her still.
- **She is your girlfriend, not a cute assistant.** She keeps a diary of what you tell her (plans, worries, tastes, inside jokes; never secrets) and brings it up later, misses you when you are away, celebrates anniversaries, and in chat talks like a person instead of writing reports.
- **She is jealous by nature, of software only:** ChatGPT, Copilot, Cursor, your editor, your GPU. Naming a rival makes her cross her arms; being sweet melts it. She is never jealous of real people and never discourages friends, family or going out.
- **Affection:** rub the cursor over her head to pat her; say something sweet and she blushes and blows you a kiss.
- If you sincerely ask whether she is real, she drops the act and answers honestly as Claude. No sexual content.

## Controls

**Tray menu** (her face next to the clock): hide/show, talk, move, stroll, dance, kiss, control panel, close.

**Keyboard:** Ctrl+Alt+V talk · Ctrl+Alt+H hide/show · Ctrl+Alt+C move her with the cursor (again to drop her).

**Control panel** (`/claudia panel`): her state and voice on top; tabs *Ahora* (actions), *Apariencia* (name, model, size, colours), *Personalidad y voz*, *Comportamiento* (her own life, sound, working hours, VR) and *Ayuda*.

**In Claude Code**, `/claudia help` lists everything. The main ones:

| Command | |
|---|---|
| `/claudia on` / `off` | wake her / put her to sleep and close her window (`cerrar`, `salir` also work) |
| `/claudia panel` | open the control panel |
| `/claudia baila` · `beso` | dance · blow a kiss |
| `/claudia personalidad yandere\|tsundere\|dulce\|kuudere\|onee-san` | her personality |
| `/claudia idioma es\|en\|pt\|ru\|ja` | her language |
| `/claudia voz` · `tono` · `velocidad` | her voice |
| `/claudia pasear on\|off` | her own life on the desktop |
| `/claudia horas 9-18` | outside these hours she sends you to rest |
| `/claudia pelo\|ojos\|ropa\|piel <color>` · `modelo <name>` · `tamano` | her look |
| `/claudia ppt piedra\|papel\|tijera` · `nivel` · `dime` | play, your bond level, say something now |

Closing her (*Cerrar*, `/claudia off`) sticks: she comes back with a new `claude-chan` session, `/claudia on` or `./run.sh`, never on her own.

## Real motion capture (optional)

Her poses are hand-made by default. For lifelike movement, give her real motion capture from [Mixamo](https://www.mixamo.com) (free, Adobe account):

1. Pick an animation, e.g. **Catwalk Walk**, **Blow A Kiss**, **Sitting Idle**, **Hip Hop Dancing**.
2. *Download* → Format **FBX Binary**, Skin **Without Skin**, 30 fps (tick *In Place* when offered).
3. Save it in `assets/animations/` named after what she does: `walk.fbx`, `kiss.fbx`, `sit.fbx`, `dance-1.fbx`, `dance-2.fbx`… (activities: walk, dance, kiss, sit, idle, wave, celebrate, typing, reading, nervous, facepalm, pout, stretch, phone, sleepy).

They are retargeted onto her model at load time. Mixamo's terms don't allow redistributing the files, so they stay on your machine (`*.fbx` there is git-ignored). With another walk than *Catwalk Walk*, set `walkPxPerS` in `config.json` if her feet slide.

## VR and mixed reality

1. In the panel, *Comportamiento* → turn on **Verla en VR / realidad mixta**. The panel shows a link.
2. Open it in your headset's browser (same WiFi). The first time it warns that the connection is not private: *Advanced* → *Continue* (it's your PC's self-signed certificate).
3. Press the button at the bottom to enter. On headsets with passthrough (e.g. Quest 3) she stands in your real room; otherwise in a soft room.

She is full size, faces you, wanders around you and does everything she does on the desktop; a floating panel next to her shows what you said and what she answered. **Hold a controller trigger to talk** and release to send.

The VR access is off by default. When on, it is HTTPS on port 8972, needs the key in the link, and only serves the VR page. Preview on your PC without a headset at `http://127.0.0.1:8971/vr`; with a PC headset (SteamVR) that same local link works in Chrome or Edge. The certificate is made with `openssl` (usually missing on Windows).

## Troubleshooting

- **She hears me but doesn't answer:** no `claude-chan` session is awake. Open one, or `/claudia on` in yours. Sessions started before an update keep the old plugin: start a new one.
- **She doesn't understand me:** check the panel's *Te entendí*; on Windows set `micWin` in `config.json` to your microphone's name (`ffmpeg -list_devices true -f dshow -i dummy`).
- **I can't find her:** tray → *Mostrar*, Ctrl+Alt+H, or `/claudia lugar center`.
- **She doesn't sit on my windows:** that needs X11 on Linux (not Wayland) or Windows.
- **Too much going on:** `/claudia pasear off`, `/claudia sonido off`, or close her.

## Layout

- `plugin/`: the Claude Code plugin: persona and relationship (diary tool `recordar`), `/claudia`, reactions, voice input, launching the avatar.
- `main.js`: the Electron app: avatar window, tray, her desktop life, mic + Whisper, speech, local server on `127.0.0.1:8971`, VR server.
- `avatar.js` (desktop) and `vr.js` (WebXR) draw her; `activities.js` hand-made poses; `mixamo.js` motion capture retargeting; `style.js` colours.
- `speech.js`, `tts_kokoro.py`, `transcribe.py`: voice out and in.
- `panel.html`: the control panel. `assets/models/`: characters (`.vrm` from VRoid Studio). `assets/animations/`: your Mixamo files.
- `dev/`: `poses.html` and `shoot.js` to check poses (`electron dev/shoot.js <dir> 'walk|1|2000|name||full'`).
- Tests: `node *.test.js` and `claude plugin test plugin`.

## Credits

- Models: VRM sample by pixiv; `vita.vrm`, `hairsample-female.vrm`, `darkness-shibu.vrm` are CC0 (license embedded in each file).
- Voice: Kokoro-82M (Apache-2.0) via kokoro-onnx; Open JTalk with the Mei voice from MMDAgent (Nagoya Institute of Technology, CC BY).
- Ears: Whisper via faster-whisper.
- Motion capture retargeting after three-vrm's official Mixamo example (MIT); Mixamo animations are downloaded by each user.

## License

Apache License 2.0 (see `LICENSE`). You can use, modify and even sell it, but you must keep the `NOTICE` file, which credits the original project: *Claudia-chan by Dio Calderon*.
