# Claudia-chan

Claude Code as an anime companion: a Claude Code plugin plus a floating 3D avatar with voice, moods and customization.

## Install

    ./setup.sh
    claude-chan

Needs Claude Code, Node, `uv`, `ffmpeg` and either an X11 desktop (Ubuntu/Debian) or macOS with Homebrew. On macOS, allow microphone access for your terminal the first time you talk to her. Windows is not supported yet.

`setup.sh` only writes inside this folder plus the `claude-chan` launcher in `~/.local/bin`. Plain `claude` keeps working as usual.

## Coming soon

Claudia-chan in **VR and mixed reality**.

## Layout

- `plugin/`: the Claude Code plugin (persona, `/claudia` command, reactions).
- Project root: the Electron avatar window, on loopback port 8971.
- `assets/models/`: extra characters. Export a `.vrm` from VRoid Studio, place it here and pick it with `/claudia modelo <name>` or `/claudia panel`.

## Credits

- Default model: VRM sample by pixiv.
- `assets/models/vita.vrm`, `hairsample-female.vrm`, `darkness-shibu.vrm`: CC0 (license embedded in each file).
- Voice: Open JTalk with the Mei voice from MMDAgent (Nagoya Institute of Technology, CC BY).
