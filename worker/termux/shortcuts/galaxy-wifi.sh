#!/data/data/com.termux/files/usr/bin/bash
# GalaxyVPN — "Wi-Fi" button, as a phone home-screen shortcut (Termux:Widget).
# Same job as the Wi-Fi button in the admin panel, but the real DPI test runs
# on THIS phone's Wi-Fi connection.
#
#  Before tapping:  be connected to Wi-Fi. Turn your VPN OFF when asked
#                   (15s countdown), then back ON to upload the results.

WORKER_DIR="$HOME/galaxyvpn/worker"

# Keep the CPU awake so Android doesn't doze mid-scan.
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

cd "$WORKER_DIR" 2>/dev/null || {
  echo "✗ Worker not found at $WORKER_DIR"
  echo "  Run the setup first (see worker/termux/README.md)."
  echo; echo "Press Enter to close…"; read -r _; exit 1
}

clear
echo "=================================================="
echo "   GalaxyVPN  ·  Wi-Fi re-check  (this phone)"
echo "=================================================="
echo "  • Make sure you are on Wi-Fi."
echo "  • Turn your VPN OFF when the countdown asks."
echo "  • Turn it back ON when testing finishes (auto-upload)."
echo "=================================================="
echo

npm run --silent sync:wifi
STATUS=$?

command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock

echo
if [ "$STATUS" -eq 0 ]; then
  echo "✅ Done — results uploaded to Supabase."
else
  echo "⚠️  Finished with errors (exit $STATUS). Scroll up for details."
fi
echo "You can turn your VPN back ON now."
echo
echo "Press Enter to close…"
read -r _
