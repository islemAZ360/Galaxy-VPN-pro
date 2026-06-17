#!/data/data/com.termux/files/usr/bin/bash
# GalaxyVPN — "WhiteList" button, as a phone home-screen shortcut (Termux:Widget).
# Run this WHILE the government's white-list block is active on LTE: it re-tests
# the LTE pool over that restricted connection and promotes the survivors to the
# White-List tier (served to LTE & Gemini subscribers).
#
#  Before tapping:  be on the WHITE-LISTED LTE connection (mobile data, white-list
#                   mode active). Turn your VPN OFF when asked, then back ON to upload.

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
echo "   GalaxyVPN  ·  White-List re-check  (this phone)"
echo "=================================================="
echo "  • Be on the WHITE-LISTED LTE connection (white-list block active)."
echo "  • Turn your VPN OFF when the countdown asks."
echo "  • Turn it back ON when testing finishes (auto-upload)."
echo "=================================================="
echo

npm run --silent sync:whitelist
STATUS=$?

command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock

echo
if [ "$STATUS" -eq 0 ]; then
  echo "✅ Done — white-list results uploaded to Supabase."
else
  echo "⚠️  Finished with errors (exit $STATUS). Scroll up for details."
fi
echo "You can turn your VPN back ON now."
echo
echo "Press Enter to close…"
read -r _
