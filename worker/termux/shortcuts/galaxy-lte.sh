#!/data/data/com.termux/files/usr/bin/bash
# GalaxyVPN — "LTE" button, as a phone home-screen shortcut (Termux:Widget).
# Same job as the LTE button in the admin panel, but the real DPI test runs
# on THIS phone's mobile-data (LTE/5G) connection.
#
#  Before tapping:  turn Wi-Fi OFF so the phone uses mobile data. Turn your VPN
#                   OFF when asked (15s countdown), then back ON to upload.

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
echo "   GalaxyVPN  ·  LTE re-check  (this phone)"
echo "=================================================="
echo "  • Turn Wi-Fi OFF — use mobile data (LTE/5G)."
echo "  • Turn your VPN OFF when the countdown asks."
echo "  • Turn it back ON when testing finishes (auto-upload)."
echo "=================================================="
echo

npm run --silent sync:lte
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
