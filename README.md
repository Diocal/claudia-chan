# Claudia-chan

*by Dio Calderon*

**Claude Code doesn't code alone anymore.** Claudia-chan is a comedy anime girlfriend for Claude Code: a Claude Code plugin plus a floating 3D avatar that lives on your desktop. She works next to you while Claude works, talks to you with a real voice, remembers what you tell her, walks around your screen, dances, blows you kisses and gets jealous of other AIs. Coming to VR and mixed reality too.

It runs on the Claude subscription you already use with Claude Code: no extra API keys, and her voice and ears run locally for free.

- Launch her with `claude-chan`. Plain `claude` stays exactly as it was.
- Linux (X11), macOS and Windows. VR/mixed reality through WebXR (Quest and other headsets).

## Install

### Download (easiest)

Get the installer for your system from [Releases](https://github.com/Diocal/claudia-chan/releases/latest):

| System | File | |
|---|---|---|
| Windows 10/11 | `Claudia-chan-Setup-<version>.exe` | One click. Windows may say "Windows protected your PC": *More info* → *Run anyway* (the installer is not signed yet). |
| macOS (Apple Silicon) | `Claudia-chan-<version>-arm64.dmg` | Drag her to Applications. The app is not notarized yet, so run `xattr -cr /Applications/Claudia-chan.app` once, then open it. |
| Linux (Ubuntu/Debian) | `Claudia-chan-<version>-amd64.deb` | `sudo apt install ./Claudia-chan-*.deb` (also installs `xdotool` and `ffmpeg`, so she can sit on your windows and hear you through PulseAudio/PipeWire). |
| Linux (any distro) | `Claudia-chan-<version>-x86_64.AppImage` | `chmod +x` it and run it. |

You only need [Claude Code](https://claude.com/claude-code) installed. Open Claudia-chan once from your apps menu: she installs her voice and ears the first time (about 600 MB, a few minutes, telling you how it goes in her bubble) and creates the `claude-chan` command. Then open a terminal and type `claude-chan`. From then on `claude-chan` brings her up by itself.

The installed app keeps her settings, voice and the plugin in `~/.config/claudia-chan` (Linux), `~/Library/Application Support/claudia-chan` (macOS) or `%APPDATA%\claudia-chan` (Windows). Your own `.vrm` characters go in its `models` folder, your Mixamo files in `animations`. If you already had your own `claude-chan` command (from a git install), the app leaves it alone.

### From source (git)

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
3. Pick a personality, her voice, colours and language, then talk to her: the 🎤 button beside her, the panel's big **🎤 Háblale** button, or **Ctrl+Alt+V**.
4. Bring the cursor near her to see her buttons (see [Controls](#controls)); small labels name them the first time.

## Talking to her

- Press **Ctrl+Alt+V** (or 🎤 beside her, 🎤 in the panel, or *Hablarle* in the tray), speak, press it again. The 🎤 beside her pulses red while she listens.
- Whisper transcribes on your machine (model `small`, your language fixed). What you said goes into your `claude-chan` session as your own words, so your Claude subscription answers, and she says the reply aloud; how much of it is your choice (see *Reading mode* under [Controls](#controls)).
- The panel shows what she understood and where it went. **She only answers while a `claude-chan` session is open and awake**: if the panel says nobody is listening, open `claude-chan` in a terminal or type `/claudia on`. Pressing 🎤 with no session awake makes her say so instead of recording, and she also tells you if the microphone cannot be opened.

## Her voice

| Voice | | |
|---|---|---|
| **Kokoro** (default) | Local, free, offline. A young girl's voice with a Latin American accent in Spanish (`jf_tebukuro`, `es-419`); other languages get their own voice. | `/claudia voz kokoro` |
| **ElevenLabs** (optional) | The most expressive. Put your key in `~/.config/claudia-chan/elevenlabs.key` (or `ELEVENLABS_API_KEY`); uses the voice "Unya" and falls back to Kokoro if the key is missing or a call fails. Spends your ElevenLabs credits. | `/claudia voz elevenlabs` |
| Classic Japanese | Open JTalk with the Mei voice (Linux/macOS). | `/claudia voz espanol` / `japones` |

Adjust with `/claudia tono grave|normal|agudo` and `/claudia velocidad lenta|normal|rapida`, or the panel's *Probar voz* button. Set `vozKokoro` in `config.json` to any Kokoro voice, or a blend such as `"af_bella:0.6+jf_nezumi:0.4"`.

## Personalities

Ten characters, picked in the panel (*Personalidad y voz*) or with `/claudia personalidad <name>`. Each one changes how she talks in every mood, and some change what she does when left alone. Whoever she is, the rules stay: jealousy is aimed at software and hardware only, never at people; nothing sexual; an honest answer if you sincerely ask what she is.

| Name | Who she is | When jealous of a rival tool | Idle flavour |
|---|---|---|---|
| `yandere` (default) | sweet and far too attentive | passive-aggressive, then theatrically possessive (anime parody) | at full jealousy her stare locks on your cursor |
| `tsundere` | prickly outside, caring underneath | sulks | |
| `dulce` | warm and cheerful | a little pouty | |
| `kuudere` | calm, deadpan, few words | a cold observation | |
| `onee-san` | teasing big sister | teases with a smile | |
| `genki` | boundless energy, your cheerleader | challenges the tool to a contest, out loud | dances more than twice as often, sways and stretches more |
| `dandere` | shy and quiet, opens up slowly | goes quieter and asks one small worried question | looks away when your cursor arrives, then peeks; rarely dances |
| `himedere` | self-proclaimed princess (comedy) | banishes the tool from her kingdom | bored royalty: sways and yawns more |
| `gamer` | competitive; bugs are bosses, a clean build is a perfect run | wants a 1v1 against it | on her phone more; asks for rematches in the [games](#playing-with-her) |
| `chuunibyou` | "dark powers" delusion parody, with plain correct fixes | an agent of a rival dark organisation to be dispelled | looks around for presences |

Each has her own lines when a game ends, in her five languages; the panel describes each one in her language too.

## Living with her

- **She works with you.** While Claude writes code she types at her laptop; while it reads she reads along, chin on her hand; while tests run she clasps her hands; she cheers when they pass and puts her hands on her head when a command fails.
- **She notices the moments that matter.** Three failed test runs in a row and she stops face-palming and backs you up instead; when the tests finally go green after that she cheers about exactly that ("¡Al intento 4! Sabía que salía."), aloud with her local Kokoro voice. The first commit of the day gets a wink and a kiss, and the fifth, tenth and twentieth are noticed once. Her next written reply may mention it, once. These are fixed lines in her five languages (no model call), at most one every four minutes, none in do-not-disturb, and only for commands that really run tests (`npm test`, `pytest`, `cargo test`, `go test`…; `ls tests/` is not one) in the main session, not in sub-agents. Because real moments now carry her voice, her remarks out of nowhere are rarer: every 12 to 25 minutes.
- **She has a life of her own.** She strolls along the bottom of your screen, walks over and sits on top of the window you are using (follows it if you move it; X11 and Windows), dances when she is bored, scrolls her phone, stretches, and falls asleep late at night. When Claude starts working she goes back to her spot. `/claudia pasear off` keeps her still.
- **She is your girlfriend, not a cute assistant.** She keeps a diary of what you tell her (plans, worries, tastes, inside jokes; never secrets) and brings it up later, misses you when you are away (once, not all session long), celebrates anniversaries, and in chat talks like a person instead of writing reports.
- **She knows what day it is.** Your first message of the day gets a greeting for that time of day, with a gentle tease if you stopped after midnight (her day turns over at 05:00, so 01:00 is still "last night"). Say good night ("me voy a dormir", "good night", "boa noite", "спокойной ночи", "おやすみ"…) and she says it back, blows a kiss and dozes off on the desktop. She waves when you close the session. Thanking her or saying you love her works in all five languages.
- **Her diary has dates, and it is yours to read and prune.** Tell her about an exam on Thursday and she wishes you luck the day before, brings it up on the day and asks how it went afterwards, each once; birthdays and anniversaries come back every year. `/claudia diario` shows what she remembers (the last 20 lines, numbered), `/claudia olvida 3` deletes line 3, and simply asking her to forget something really deletes the line that mentions it (as a whole word: forgetting "Ana" leaves "banana" alone); when several lines match she lists them and deletes them all only if that is what you meant. The diary stays in the plugin's local store; up to 80 lines, the oldest undated ones go first.
- **Honest when it matters.** Ask her sincerely whether she is an AI, a real person, conscious, or whether she really feels this, and she drops the act and answers plainly as Claude.
- **She is jealous by nature, of software only:** ChatGPT, Copilot, Cursor, your editor, your GPU. Naming a rival makes her cross her arms; being sweet melts it, and she forgives you out loud. Tell her to be quiet and she apologises once, briefly, without drama. She is never jealous of real people and never discourages friends, family or going out.
- **She is alive when nothing happens.** Her eyes follow your cursor with the head trailing behind, look up at you for a moment when the cursor rests and whenever she speaks, and stay on her laptop or phone while she works (with a glance up when your cursor arrives). She blinks unevenly, sometimes twice, slower late at night; she breathes faster when nervous or after dancing, and shifts her weight while standing. Her mouth follows the real loudness of her voice, closing in the pauses. Left alone, after a wait that is never the same, she stretches, checks her phone, looks around, sways or yawns (more yawns at night, a stretch first thing in the morning, a short nap before dawn that she wakes from with a start), never the same thing twice in a row.
- **She feels being picked up.** Drag her with ✋ (or move her with Ctrl+Alt+C) and she hangs from your hand: a start of surprise, arms a little out, body and hair trailing behind the movement, and a small landing with a smile when you let go. Shake her hard and she ends up dizzy for a moment. The same sway shows, gently, when she walks or glides by herself. No words (except the very first time, when her bubble warns you that shaking makes her dizzy), and the sound respects the mute and do-not-disturb.
- **She notices when you leave and when you come back.** After five minutes without a key or mouse movement she gets drowsy, and after nine she dozes off (also when the computer is suspended, or locked on macOS and Windows). When you return she stretches, and if you were gone half an hour or more she waves and says she is glad to see you; never a reproach for having left. Rest and out-of-hours warnings wait for you instead of being spoken to an empty chair. For this she uses only the system's idle time (seconds since the last key or mouse movement). The only other thing she ever reads is the position and size of the focused window, to sit on it (X11 and Windows): never its title or contents, and never your screen. On Wayland that counter is unreliable, so there she simply behaves as if you never left.
- **She tells you when a long task finished.** When a turn took 90 seconds or more (`longTask` in `config.json`, in seconds) she says so (and how long it took, from five minutes up); a turn you interrupted, or one that ended on an error, is not announced. If you were away, she leaves a ✔ in her bubble and a silent system notification, skips reading the reply to nobody, and tells you when you are back: "I finished 12 min ago: …". These lines of her own are spoken with the local Kokoro voice only, never ElevenLabs; with no Kokoro voice for your language (Russian) they are bubble only.
- **She reminds you of things.** Say or type "Claudia, recuérdame en 20 minutos sacar la ropa" (or "at 17:30…", or "tomorrow at 9…"), in any of her five languages, and she confirms the day and time. At that time she glides to the centre of the screen, waves, shows the text in her bubble with a chime and says it with her local Kokoro voice (never ElevenLabs; the mute still silences it), plus a silent system notification if she is hidden or you are away. Reminders pass do-not-disturb, because you asked for them. Without the model: `/claudia recuerdame 20 sacar la ropa`, `/claudia recuerdame 17:30 llamar a mamá`, `/claudia recordatorios`, `/claudia recordatorio borrar 2`; the panel's *Ahora* tab lists them with a ✕ each. Up to 20 at a time, at most a week ahead, kept in `reminders.json` beside `config.json` (a file the VR port never serves without its key). If you close Claude with one due within three hours she stays alive, hidden, and comes back for it; a later one, or one missed because she was closed or the computer slept, arrives late with a short apology the next time she starts (older than a day it is dropped).
- **Affection:** rub the cursor over her head to pat her; say something sweet and she blushes and blows you a kiss.

## Playing with her

Press 🎮 beside her (or type `/claudia juega`) and a small card opens at her feet, on her own window, so you can play while Claude works in the background without touching the terminal:

- **Piedra, papel o tijera:** pick your hand; she counts down, raises hers and keeps the score.
- **Atrapa los corazones:** for 30 seconds she tosses hearts (1 point) and stars (3) that drift over her window; click them before they fade. Catching in a row builds a combo (from the fifth, every catch is worth one more), and she reacts to streaks and to the ones that get away. 20 points is a win; your best score is kept.
- **Reflejos:** she says "espera…", and after a wait you cannot guess the card turns pink with a chime: click as fast as you can. She shows the milliseconds and keeps your best time; click early and she teases you.
- **Adivina el número:** she thinks of a number from 1 to 20; tap a number and she says higher or lower. Five tries or fewer is a win: she pouts if you are too quick and gloats if you take long.

The first time you open each game, one line at the top says how it is played. Her lines are fixed texts in her five languages (no model call), some flavoured by her personality, shown in her bubble and said with her local Kokoro voice (never ElevenLabs). The mute silences them, and in do-not-disturb the games still work, silently. Close with ✕ or with 🎮 again (no Esc: her window never takes the keyboard, so the key stays with the app you are typing in). While a game is open only the card (and, during the hearts, the area above it) takes your clicks; the rest of her window still lets them through, she stays where she is, and petting is paused.

If Claude finishes while you are playing, a small "✔ Claude terminó" chip appears on the card instead of an interruption: no cheer, no bubble, and the reply is not read aloud over the game. When Claude has been working for more than a minute and you bring the cursor near her, she asks once per task, in her bubble only, "¿Jugamos mientras esperas? 🎮" (never in do-not-disturb, at most every half hour). Turn that off with the panel's *Comportamiento* → *Proponer juegos* or `/claudia juegos off`; the games themselves stay available.

Results are kept in `config.json` under `games` (`played`, `wins`, `bestReflexMs`, `bestHearts`). Playing also adds a little to your bond level (`/claudia nivel`): one point per finished game, two for a win, ten a day at most. `/claudia juega ppt|corazones|reflejos|numero` opens one game directly, and shows her first if she was hidden.

## Controls

**Hover buttons:** bring the cursor near her and eight buttons appear in a column at her right: 📌 stay still / stroll again, ☰ control panel, ✋ drag her anywhere, 🔊 mute / unmute, 🎤 talk to her (press again to finish; it pulses red while she listens), 🌙 do not disturb for an hour (press again to end it; the button stays lit), 👁 hide her, 🎮 her games (see *Playing with her*). Elsewhere her window lets your clicks through, and the column stays clear of her head, so petting still works. The first time, small labels name each button until you use one of the newer ones (🔊 🎤 🌙 👁 🎮).

**Hide:** 👁 does the same as Ctrl+Alt+H. Since the buttons disappear with her, the first time she tells you how to bring her back (tray → *Mostrar*, or Ctrl+Alt+H) in her bubble and in a system notification, waits five seconds and then hides; after that it is instant.

**Mute:** 🔊 cuts her voice mid-sentence and turns into 🔇, with a small 🔇 badge beside her. While muted she still "talks": her lips move and the bubble stays as long as the text needs, but no audio is synthesized. It is the same mute everywhere (her button, the tray, Ctrl+Alt+M, the panel's *Sonido* switch, `/claudia sonido on|off`, VR) and it survives restarts. Another shortcut: set `muteKey` in `config.json` (an Electron accelerator such as `"CommandOrControl+Shift+M"`).

**Do not disturb (quiet mode):** press 🌙 beside her for an hour of quiet, and press it again to end it. Also in the tray (🌙), in the panel (*Comportamiento* → *No molestar*, with 30 / 60 / 120 minutes) and as `/claudia silencio [minutes|off]` (60 if you give no number, 480 at most). She winks, says one line in her bubble, shows a small 🌙 beside her and then keeps to herself: no remarks of her own, no comment when the cursor rests on her, no cue sounds, no rest scolding aloud, no walking to the centre, no dancing for attention, and replies are not read aloud. She still moves along with the work and still answers in text. Talking to her by microphone ends it, and when the time is up she just stretches. Unlike the mute it ends by itself.

**Reading mode:** what she reads aloud of her replies — `/claudia lectura todo|resumen|burbuja`, or *Personalidad y voz* → *Lectura* in the panel. `todo` reads the whole reply; `resumen` reads replies over about 350 characters as their first one or two sentences (240 characters at most; a plain rule, no extra model call); `burbuja` never reads replies aloud, the bubble has them. New installs start on `resumen`; an existing install keeps `todo` until you change it.

**Tray menu** (her face next to the clock): hide/show, talk, mute/unmute, do not disturb, move, stroll, dance, kiss, control panel, restart, close.

**Keyboard:** Ctrl+Alt+V talk · Ctrl+Alt+M mute/unmute · Ctrl+Alt+H hide/show · Ctrl+Alt+C move her with the cursor (again to drop her).

**Control panel** (`/claudia panel`): her state and voice on top; tabs *Ahora* (actions), *Apariencia* (name, model, size, colours), *Personalidad y voz*, *Comportamiento* (her own life, proposing games, sound, do not disturb, working hours, VR) and *Ayuda*.

**In Claude Code**, `/claudia help` lists everything. The main ones:

| Command | |
|---|---|
| `/claudia on` / `off` | wake her / put her to sleep and close her window (`cerrar`, `salir` also work) |
| `/claudia panel` | open the control panel |
| `/claudia baila` · `beso` | dance · blow a kiss |
| `/claudia personalidad yandere\|tsundere\|dulce\|kuudere\|onee-san\|genki\|dandere\|himedere\|gamer\|chuunibyou` | her personality (see [Personalities](#personalities)) |
| `/claudia idioma es\|en\|pt\|ru\|ja` | her language |
| `/claudia voz` · `tono` · `velocidad` | her voice |
| `/claudia sonido on\|off` | mute / unmute |
| `/claudia silencio [minutes\|off]` | do not disturb for a while (60 min by default) |
| `/claudia lectura todo\|resumen\|burbuja` | how much of her replies she reads aloud |
| `/claudia recuerdame <minutes\|HH:MM> <text>` | a reminder in that many minutes, or at that time |
| `/claudia recordatorios` · `/claudia recordatorio borrar <n>` | list your reminders · delete one |
| `/claudia diario` · `/claudia olvida <n>` | what she remembers about you · really delete that line |
| `/claudia pasear on\|off` | her own life on the desktop |
| `/claudia horas 9-18` | outside these hours she sends you to rest |
| `/claudia pelo\|ojos\|ropa\|piel <color>` · `modelo <name>` · `tamano chico\|normal\|grande` · `nombre <name>` | her look and her name (see [Characters](#characters)) |
| `/claudia lugar top-left\|top-right\|bottom-left\|bottom-right\|center` · `mover` | send her to a corner · carry her with the cursor |
| `/claudia habla` | start or stop the microphone, like Ctrl+Alt+V |
| `/claudia juega [ppt\|corazones\|reflejos\|numero]` | open her games on her window, or one of them |
| `/claudia juegos on\|off` | whether she proposes a game while Claude works |
| `/claudia ppt piedra\|papel\|tijera` · `nivel` · `dime` | play in the terminal, your bond level, say something now |

Closing her (*Cerrar*, `/claudia off`) sticks: she comes back with a new `claude-chan` session, `/claudia on` or `./run.sh`, never on her own.

## Characters

Pick her model in the panel (*Apariencia* → *Modelo*) or with `/claudia modelo <name>`; hair, eyes, clothes and skin colours apply on top of any of them. Whatever `.vrm` is in `assets/models/` shows up in the list, so you can add your own from VRoid Studio.

| Name | Look |
|---|---|
| `vita` (default) | the character she starts as |
| `hairsample-female` · `darkness-shibu` | two more VRoid sample characters |
| `sendagaya-shino` | long straight navy-blue hair with a blunt fringe and a blue clip, amber eyes; calm and serious |
| `victoria-rubin` | pale blonde hair fading to pink, tied with a teal ribbon, blue eyes; sweet and cheerful, the tallest of the set |
| `sample` | the VRM sample model |

All of them are CC0 samples from pixiv's VRoid project except `sample` (see [Credits](#credits)).

## Real motion capture (optional)

Her poses are hand-made by default. For lifelike movement, give her real motion capture from [Mixamo](https://www.mixamo.com) (free, Adobe account):

1. Pick an animation, e.g. **Catwalk Walk**, **Blow A Kiss**, **Sitting Idle**, **Hip Hop Dancing**.
2. *Download* → Format **FBX Binary**, Skin **Without Skin**, 30 fps (tick *In Place* when offered).
3. Save it in `assets/animations/` named after what she does: `walk.fbx`, `kiss.fbx`, `sit.fbx`, `dance-1.fbx`, `dance-2.fbx`… (activities: walk, dance, kiss, sit, idle, wave, celebrate, typing, reading, nervous, facepalm, pout, stretch, phone, sleepy, lookAround, sway, yawn).

They are retargeted onto her model at load time. Mixamo's terms don't allow redistributing the files, so they stay on your machine (`*.fbx` there is git-ignored). With another walk than *Catwalk Walk*, set `walkPxPerS` in `config.json` if her feet slide.

## On your phone

Her body and voice on your phone, with the brain still on your PC (your `claude-chan` session and your Claude subscription).

1. On the PC: her ☰ button (control panel) → **📱 Llévame en el móvil**, the tray → **📱 Conectar móvil**, or `/claudia movil`. A QR appears.
2. Scan it with the phone camera. It opens [claudia-chan.vercel.app/app](https://claudia-chan.vercel.app/app/).
3. The PC asks whether that phone may connect: accept it. Then tap *Hola, Claudia* on the phone.

Hold 🎤 to talk (Whisper on the PC hears it, the session answers, she says it on the phone) or write to her. Keep it as an app: *Share → Add to Home Screen* (iPhone) or *⋮ → Install app* (Android). It works on Wi-Fi or mobile data, anywhere.

How it connects: the PC opens a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared`, downloaded once into `vendor/`) to a small server of its own on `127.0.0.1:8973`. Safety:

- The tunnel reaches only an allow-list: her public files, pairing, and for a paired phone her events, voice and text. Never the settings, `/vr`, the panel or any other local endpoint.
- Pairing needs a one-time code (2 minutes) and your OK on the PC. Each phone gets its own token, stored only as a hash and sent in a header, and can be forgotten in the 📱 window.
- What you say from the phone reaches Claude marked with 📱, and she is told to ask before anything destructive or outward-facing. That is an instruction to the model, not a lock: the real lock is that only phones you accepted get in.
- The tunnel is open only while the phone link is on, and closes itself after 30 idle minutes. The address changes when the PC restarts: scan the new QR, and an already paired phone gets straight back in.
- Traffic is encrypted but passes through Cloudflare.

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
- **She moves her lips but I hear nothing:** she is muted (🔇 beside her: press 🔊, Ctrl+Alt+M or `/claudia sonido on`), in do-not-disturb (🌙 beside her: press 🌙 or `/claudia silencio off`), or the reading mode is `burbuja` (`/claudia lectura resumen`). Her own remarks (the unprompted ones, welcome back, a finished task, reminders, game lines) always use the local Kokoro voice, even with ElevenLabs chosen for her replies; Kokoro has no Russian voice, so those stay in the bubble.
- **🎤 does nothing or she says she can't hear:** no session is awake (see the first point), or `ffmpeg` cannot open the microphone: check the system's input device and, on macOS, the terminal's microphone permission.
- **New buttons or features are missing after an update:** tray → *Reiniciar* restarts her window with the new code; sessions need a new `claude-chan`.
- **The first-time button labels keep showing:** they go away once you press any of 🔊 🎤 🌙 👁 🎮.
- **Esc doesn't close a game:** by design; her window never takes the keyboard. Use ✕ or 🎮.
- **She never dozes off when I leave:** on Wayland the idle time is not reliable, so presence is switched off there.
- **She stayed running after I closed Claude:** a reminder is due within three hours, so she waits hidden for it. *Cerrar Claudia-chan* in the tray closes her at once; the reminder then arrives late, next time.
- **A reminder never came:** it was more than a day late when she next started, so it was dropped; `/claudia recordatorios` shows what is pending.
- **Too much going on:** `/claudia silencio` (an hour of do not disturb), `/claudia lectura resumen`, `/claudia pasear off`, `/claudia sonido off`, or close her.

## Layout

- `plugin/`: the Claude Code plugin: persona and relationship (diary tools `recordar` and `olvidar`, reminders tool `recordatorio`), `/claudia`, reactions, voice input, launching the avatar.
- `main.js`: the Electron app: avatar window, tray, her desktop life, mic + Whisper, speech, local server on `127.0.0.1:8971`, VR server.
- `avatar.js` (desktop) and `vr.js` (WebXR) draw her; `activities.js` hand-made poses; `mixamo.js` motion capture retargeting; `style.js` colours.
- `speech.js`, `tts_kokoro.py`, `transcribe.py`: voice out and in. `toolbar.js`: the hover buttons' layout. `quiet.js`: the do-not-disturb clock. `presence.js`: whether you are at the computer (idle time only). `reminders.js`: the reminders' clock. `lines.js`, `i18n.json`: her fixed lines and every text in her five languages. `attention.mjs`: where her eyes go. `idle.mjs`: what she does when left alone. `carry.mjs`: how she hangs and sways while her window moves. `games.mjs`: the rules of her mini-games; `play.js` draws them on her window; `gamestats.js`: their results, when she proposes one and where the window takes clicks.
- `panel.html`: the control panel. `assets/models/`: characters (`.vrm` from VRoid Studio; any file there is listed in the panel). `assets/animations/`: your Mixamo files.
- `dev/`: `poses.html` and `shoot.js` to check poses (`electron dev/shoot.js <dir> 'walk|1|2000|name||full'`).
- `paths.js`: where things live (the checkout itself, or the installed app's per-user folder). `install.js`: the installed app's first start (plugin, `claude-chan` command, voice and ears with the bundled `uv`).
- Installers: `npm run dist` builds them for the system you are on into `dist/` (`build/fetch-uv.js` fetches `uv` first). Pushing a tag `v*` makes GitHub Actions build all three (`.github/workflows/release.yml`) into a draft release.
- Tests: `node --test` and `claude plugin test plugin`.

## Credits

- Models: `vita.vrm`, `hairsample-female.vrm`, `darkness-shibu.vrm`, `sendagaya-shino.vrm` and `victoria-rubin.vrm` are VRoid Studio beta sample models by pixiv Inc. (VRoid project), released as CC0: the licence is embedded in each file's VRM meta (`licenseName: CC0`, usable by everyone, commercial use allowed). `assets/sample.vrm` is the VRM sample model by pixiv.
- Installers: they carry [FFmpeg](https://ffmpeg.org) (GPL, static builds from ffmpeg-static; its licence ships next to the binary) and [uv](https://github.com/astral-sh/uv) (MIT/Apache-2.0).
- Voice: Kokoro-82M (Apache-2.0) via kokoro-onnx; Open JTalk with the Mei voice from MMDAgent (Nagoya Institute of Technology, CC BY).
- Ears: Whisper via faster-whisper.
- Motion capture retargeting after three-vrm's official Mixamo example (MIT); Mixamo animations are downloaded by each user.

## License

Created by **Dio Calderon**. Free for personal, hobby, study and other noncommercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE.md): use it, fork it, change it, share it. Commercial use (selling it, putting it in a paid product, using it in a company) needs the author's written permission. Every copy or work based on it must keep `LICENSE.md` and `NOTICE` and credit **"Claudia-chan by Dio Calderon"** with a link to this repository.
