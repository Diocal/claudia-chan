#!/bin/sh
# Installs what is not kept in git: npm packages, Open JTalk with the Mei voice, Whisper,
# and the `claude-chan` command. Ubuntu/Debian. Nothing is installed system-wide.
set -e
cd "$(dirname "$0")"
npm ci
mkdir -p vendor/root vendor/mei
work=$(mktemp -d)
(cd "$work" && apt-get download open-jtalk open-jtalk-mecab-naist-jdic libhtsengine1)
for deb in "$work"/*.deb; do dpkg -x "$deb" vendor/root; done
curl -sSL -o "$work/mei.zip" https://sourceforge.net/projects/mmdagent/files/MMDAgent_Example/MMDAgent_Example-1.8/MMDAgent_Example-1.8.zip/download
unzip -q -o -j "$work/mei.zip" 'MMDAgent_Example-1.8/Voice/mei/*' -d vendor/mei
rm -rf "$work"
uv venv -q vendor/whisper --python 3.11
uv pip install -q --python vendor/whisper/bin/python faster-whisper
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\nexec claude --plugin-dir "%s/plugin" "$@"\n' "$PWD" > "$HOME/.local/bin/claude-chan"
chmod +x "$HOME/.local/bin/claude-chan"
echo 'Ready: run claude-chan'
