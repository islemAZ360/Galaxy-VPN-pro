#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  GalaxyVPN Tester Worker — one-time Termux setup
#
#  Installs everything needed to run the Wi-Fi / LTE scans on your PHONE:
#    - Node.js, git, wget, unzip
#    - xray-knife (the REAL DPI tester) — Android arm64 build, onto your PATH
#    - the worker's npm dependencies
#    - the two home-screen shortcut scripts into ~/.shortcuts/
#
#  Run it from inside the worker folder after cloning the repo:
#    cd ~/galaxyvpn/worker && bash termux/setup.sh
# ============================================================================
set -e

XK_VERSION="v10.0.0"
XK_ASSET="Xray-knife-android-arm64-v8a.zip"
WORKER_DIR="$HOME/galaxyvpn/worker"

echo "==================================================="
echo "  GalaxyVPN  ·  Termux worker setup"
echo "==================================================="

echo
echo "▸ [1/5] Installing system packages (nodejs, git, wget, unzip)…"
# Refresh lists AND upgrade installed packages first. The upgrade is essential:
# a freshly-pulled nodejs links against a newer openssl, and leaving an old
# openssl behind makes node die with
#   "CANNOT LINK EXECUTABLE node: cannot locate symbol OSSL_PROVIDER_add_conf_parameter".
# --force-confold keeps your existing config files so the upgrade stays non-interactive.
pkg update -y || true
pkg upgrade -y -o Dpkg::Options::="--force-confold" || true
pkg install -y nodejs git wget unzip

if [ ! -f "$WORKER_DIR/package.json" ]; then
  echo "✗ Worker not found at: $WORKER_DIR"
  echo "  Clone the repo first:  git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git ~/galaxyvpn"
  exit 1
fi
cd "$WORKER_DIR"

echo
echo "▸ [2/5] Installing worker dependencies (npm install)…"
npm install

echo
echo "▸ [3/5] Downloading xray-knife $XK_VERSION (Android arm64)…"
TMP="$(mktemp -d)"
wget -q --show-progress -O "$TMP/xk.zip" \
  "https://github.com/lilendian0x00/xray-knife/releases/download/$XK_VERSION/$XK_ASSET"
unzip -o "$TMP/xk.zip" -d "$TMP/xk" >/dev/null
# Locate the binary inside the zip (ignore checksum / archive files).
BIN="$(find "$TMP/xk" -type f ! -name '*.dgst' ! -name '*.zip' -iname 'xray-knife*' | head -n1)"
if [ -z "$BIN" ]; then
  BIN="$(find "$TMP/xk" -maxdepth 3 -type f ! -name '*.dgst' ! -name '*.zip' | head -n1)"
fi
if [ -z "$BIN" ]; then
  echo "✗ Could not find the xray-knife binary inside the zip."
  exit 1
fi
cp "$BIN" "$PREFIX/bin/xray-knife"
chmod +x "$PREFIX/bin/xray-knife"
rm -rf "$TMP"
echo "  ✓ installed → $(command -v xray-knife)"

echo
echo "▸ [4/5] Installing home-screen shortcuts into ~/.shortcuts/ …"
mkdir -p "$HOME/.shortcuts"
cp "$WORKER_DIR/termux/shortcuts/galaxy-wifi.sh" "$HOME/.shortcuts/galaxy-wifi.sh"
cp "$WORKER_DIR/termux/shortcuts/galaxy-lte.sh"  "$HOME/.shortcuts/galaxy-lte.sh"
chmod +x "$HOME/.shortcuts/galaxy-wifi.sh" "$HOME/.shortcuts/galaxy-lte.sh"
echo "  ✓ galaxy-wifi.sh  +  galaxy-lte.sh"

echo
echo "▸ [5/5] Checking configuration (.env)…"
if [ ! -f "$WORKER_DIR/.env" ]; then
  echo "  ⚠️  .env is MISSING. Create it before scanning:"
  echo "       cp termux/.env.termux.example .env"
  echo "       nano .env     # paste your SUPABASE_SERVICE_ROLE_KEY"
else
  echo "  ✓ .env found."
fi

echo
echo "==================================================="
echo "  ✅ Setup complete!"
echo "==================================================="
echo "  Quick test:   npm run sync:wifi"
echo
echo "  Home screen:  add the 'Termux:Widget' widget, then tap"
echo "                galaxy-wifi / galaxy-lte to scan."
echo "==================================================="
