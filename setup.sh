#!/bin/sh
# Installs what is not kept in git: npm packages, Open JTalk with the Mei voice, Whisper,
# and the `claude-chan` command. Ubuntu/Debian or macOS with Homebrew.
set -e
cd "$(dirname "$0")"
npm ci
node node_modules/electron/install.js
if [ "$(uname)" = Darwin ]; then
  # Homebrew's open-jtalk ships the dictionary and the Mei voice; link them into the Linux layout.
  brew install open-jtalk
  jtalk=$(brew --prefix open-jtalk)
  mkdir -p vendor/root/usr/bin vendor/root/var/lib/mecab/dic/open-jtalk
  ln -sfn "$jtalk/bin/open_jtalk" vendor/root/usr/bin/open_jtalk
  ln -sfn "$jtalk/dic" vendor/root/var/lib/mecab/dic/open-jtalk/naist-jdic
  ln -sfn "$jtalk/voice/mei" vendor/mei
else
  mkdir -p vendor/root vendor/mei
  work=$(mktemp -d)
  (cd "$work" && apt-get download open-jtalk open-jtalk-mecab-naist-jdic libhtsengine1)
  for deb in "$work"/*.deb; do dpkg -x "$deb" vendor/root; done
  curl -sSL -o "$work/mei.zip" https://sourceforge.net/projects/mmdagent/files/MMDAgent_Example/MMDAgent_Example-1.8/MMDAgent_Example-1.8.zip/download
  unzip -q -o -j "$work/mei.zip" 'MMDAgent_Example-1.8/Voice/mei/*' -d vendor/mei
  rm -rf "$work"
fi
uv venv -q vendor/whisper --python 3.11
uv pip install -q --python vendor/whisper/bin/python faster-whisper
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\nexec claude --plugin-dir "%s/plugin" "$@"\n' "$PWD" > "$HOME/.local/bin/claude-chan"
chmod +x "$HOME/.local/bin/claude-chan"
echo 'Ready: run claude-chan'
