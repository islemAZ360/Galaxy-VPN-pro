#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════
#  GalaxyVPN Pro — Termux Auto-LTE Setup Script
#  Run this ONCE on your Samsung phone to set everything up.
# ═══════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🚀 GalaxyVPN Pro — Termux Auto-LTE Setup              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Install essential packages ──────────────────────────────
echo "📦 Installing packages..."
pkg update -y
pkg install -y nodejs-lts git unzip termux-api

# ─── 2. Clone or update the repo ────────────────────────────────
WORK_DIR="$HOME/galaxyvpn"
if [ -d "$WORK_DIR" ]; then
  echo "📁 Updating existing repo..."
  cd "$WORK_DIR"
  git pull
else
  echo "📁 Cloning repo..."
  git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git "$WORK_DIR"
  cd "$WORK_DIR"
fi

# ─── 3. Install worker dependencies ─────────────────────────────
echo "📦 Installing worker dependencies..."
cd worker
npm install

# ─── 4. Download xray-knife for ARM64 ───────────────────────────
echo "🔧 Downloading xray-knife for ARM64..."
XRAY_DIR="$HOME/xray-knife"
mkdir -p "$XRAY_DIR"

# Check if already downloaded
if [ -f "$XRAY_DIR/xray-knife" ]; then
  echo "  ✅ xray-knife already exists"
else
  # Download latest xray-knife ARM64 release
  XRAY_URL="https://github.com/lilendian0x00/xray-knife/releases/download/v10.0.0/Xray-knife-linux-arm64-v8a.zip"
  echo "  Downloading from: $XRAY_URL"
  curl -L -o /tmp/xray-knife.zip "$XRAY_URL" 2>/dev/null || {
    echo "  ⚠️  Could not download xray-knife automatically."
    echo "  Please download the ARM64 version manually and place it at: $XRAY_DIR/xray-knife"
    echo "  Download from: https://github.com/lilendian0x00/xray-knife/releases"
  }
  if [ -f /tmp/xray-knife.zip ]; then
    unzip -o /tmp/xray-knife.zip -d "$XRAY_DIR"
    chmod +x "$XRAY_DIR"/xray-knife*
    rm /tmp/xray-knife.zip
    echo "  ✅ xray-knife downloaded and extracted"
  fi
fi

# ─── 5. Create .env file ────────────────────────────────────────
ENV_FILE="$WORK_DIR/worker/.env"
if [ -f "$ENV_FILE" ]; then
  echo "📄 .env file already exists"
else
  echo "📄 Creating .env file..."
  cat > "$ENV_FILE" << 'ENVEOF'
# ── Supabase credentials ──
SUPABASE_URL=YOUR_SUPABASE_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_KEY_HERE

# ── Auto mode (skip VPN prompts) ──
AUTO_MODE=1

# ── xray-knife path ──
XRAY_KNIFE_PATH=/data/data/com.termux/files/home/xray-knife/xray-knife

# ── Concurrency (lower for phone) ──
TEST_CONCURRENCY=15

# ── Watcher settings ──
POLL_INTERVAL_MIN=3
STABILITY_WAIT_MIN=5
ENVEOF
  echo ""
  echo "  ⚠️  IMPORTANT: Edit the .env file with your Supabase credentials!"
  echo "  Run: nano $ENV_FILE"
  echo ""
fi

# ─── 6. Acquire wake lock ───────────────────────────────────────
echo "🔒 Acquiring Termux wake lock..."
termux-wake-lock 2>/dev/null || echo "  (termux-wake-lock not available — install Termux:API)"

# ─── 7. Create startup script for Termux:Boot ───────────────────
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"
cat > "$BOOT_DIR/start-lte-watcher.sh" << 'BOOTEOF'
#!/data/data/com.termux/files/usr/bin/bash
# Auto-start LTE watcher on boot
termux-wake-lock
cd ~/galaxyvpn/worker
node --env-file-if-exists=.env src/termux-watcher.js >> ~/lte-watcher.log 2>&1 &
BOOTEOF
chmod +x "$BOOT_DIR/start-lte-watcher.sh"
echo "  ✅ Boot script created at $BOOT_DIR/start-lte-watcher.sh"

# ─── 8. Create quick-start script ───────────────────────────────
cat > "$HOME/start-watcher.sh" << 'STARTEOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd ~/galaxyvpn/worker
echo "🚀 Starting LTE Watcher..."
node --env-file-if-exists=.env src/termux-watcher.js
STARTEOF
chmod +x "$HOME/start-watcher.sh"

# ─── Done! ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup Complete!                                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  📝 NEXT STEPS:                                          ║"
echo "║                                                          ║"
echo "║  1. Edit .env with your Supabase credentials:            ║"
echo "║     nano ~/galaxyvpn/worker/.env                         ║"
echo "║                                                          ║"
echo "║  2. Samsung Battery Settings (DO THIS!):                 ║"
echo "║     Settings → Battery → Background usage limits         ║"
echo "║     → Never sleeping apps → Add Termux                   ║"
echo "║     AND                                                   ║"
echo "║     Settings → Apps → Termux → Battery → Unrestricted    ║"
echo "║                                                          ║"
echo "║  3. Install Termux:Boot from F-Droid for auto-start      ║"
echo "║                                                          ║"
echo "║  4. Start the watcher:                                   ║"
echo "║     bash ~/start-watcher.sh                              ║"
echo "║                                                          ║"
echo "║  5. Or manually:                                         ║"
echo "║     cd ~/galaxyvpn/worker                                ║"
echo "║     npm run termux:watch                                 ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
