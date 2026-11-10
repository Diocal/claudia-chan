# macOS port

Goal: `./setup.sh && claude-chan` works on macOS (Apple Silicon) as well as Ubuntu/Debian.

## Changes

- `setup.sh`: on Darwin, `brew install open-jtalk` and symlink its binary, dictionary and Mei voice
  into the same `vendor/` layout the apt branch produces. `speech.js` stays unchanged.
  (The Homebrew formula ships `dic/` and `voice/mei/`, statically linked, no extra libs.)
- `run.sh`, `plugin/hooks/register.tsx` (`launchAvatar`): use `setsid` only when it exists, and
  start the Electron binary named in `node_modules/electron/path.txt`
  (`electron` on Linux, `Electron.app/Contents/MacOS/Electron` on macOS).
- `plugin/hooks/register.tsx`: drop the hardcoded `/home/dio` paths. The avatar folder is
  `$.plugin.root/..`; the memory index is `$HOME/.claude/projects/<encoded $HOME>/memory/MEMORY.md`,
  and its links are made absolute so the persona can point at them.
- `main.js`: record the mic with `avfoundation` on macOS, `pulse` elsewhere; hide the Dock icon
  (the macOS side of `skipTaskbar`).
- `README.md`: list macOS.

## Trade-offs

- Symlinking Homebrew's files keeps one code path in `speech.js` instead of branching per OS.
- The microphone needs macOS permission for the terminal that runs Claude Code; that is a
  one-time system prompt, not code.
