# Running the GalaxyVPN Tester Worker on your phone (Termux)

This lets you run the **Wi-Fi** and **LTE** re-checks (the same ones behind the
admin-panel buttons) from your Android phone, with two **home-screen shortcuts**.

Why a phone is ideal: the whole point is testing on the *real* networks Russian
users have. A phone literally **has** real Wi-Fi and real LTE/5G — so tapping a
shortcut tests on the exact connection it names. Each tap runs once and exits,
so there's no always-on background process for Android to kill.

**Phone and PC never interfere.** The phone scans run directly from the
shortcuts; they do **not** listen to the admin dashboard's Wi-Fi/LTE requests
(`sync_requests`), which reach **only the PC worker** (`npm start` / the
`start-worker.bat` on Windows). So the PC keeps working exactly as before, the
phone works even when the PC is off, and a dashboard click never triggers the
phone. Just don't start a PC scan and a phone scan at the very same moment —
both rewrite the shared server pool, so use one device at a time.

> The scans test on your raw connection, so you'll be asked to turn your **VPN
> OFF** for ~15s during testing, then back **ON** to upload results (the worker
> auto-retries the upload for several minutes while you switch it back).

---

## 1. Install the apps (from F-Droid — important!)

Install **both** from F-Droid, *not* the Play Store (the Play Store builds are
outdated and the widget won't talk to Termux):

- **Termux** — https://f-droid.org/packages/com.termux/
- **Termux:Widget** — https://f-droid.org/packages/com.termux.widget/

(Get the F-Droid app first from https://f-droid.org, then search those two.)

## 2. Get the code and run the setup (one time)

Open **Termux** and paste this whole block (it grants storage, clones the repo,
and installs Node.js + xray-knife + the shortcuts):

```bash
termux-setup-storage
pkg install -y git
git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git ~/galaxyvpn
cd ~/galaxyvpn/worker
bash termux/setup.sh
```

## 3. Add your secret key (one time)

```bash
cd ~/galaxyvpn/worker
cp termux/.env.termux.example .env
nano .env
```

Replace `PASTE_YOUR_SERVICE_ROLE_KEY_HERE` with your Supabase **service_role**
key (the same value as `SUPABASE_SERVICE_ROLE_KEY` in your PC's `worker/.env`).
Save in nano with **Ctrl+O, Enter**, then exit with **Ctrl+X**.

## 4. Test it once

```bash
npm run sync:wifi
```

You should see the GalaxyVPN banner, a "turn VPN off" countdown, the live test
progress, then an upload + a JSON summary. If that works, the shortcuts work.

## 5. Put the two buttons on your home screen

1. Long-press an empty spot on your Android home screen → **Widgets**.
2. Find **Termux:Widget** and drag it onto the home screen.
3. It lists your scripts — you'll see **galaxy-wifi** and **galaxy-lte**.
   - To get a single one-tap icon instead: pick the *"Termux shortcut"* widget
     and choose `galaxy-wifi.sh` (repeat for `galaxy-lte.sh`).

Now **galaxy-wifi** = the Wi-Fi button, **galaxy-lte** = the LTE button.

| Tap            | Be on…                         | Then |
|----------------|--------------------------------|------|
| **galaxy-wifi** | Wi-Fi                          | VPN OFF during the countdown, ON after |
| **galaxy-lte**  | mobile data (Wi-Fi turned off) | VPN OFF during the countdown, ON after |

---

## Updating later

```bash
cd ~/galaxyvpn && git pull && cd worker && npm install
cp -f termux/shortcuts/galaxy-*.sh ~/.shortcuts/ && chmod +x ~/.shortcuts/galaxy-*.sh
```

## Troubleshooting

- **`node` fails: "cannot locate symbol OSSL_PROVIDER_add_conf_parameter"** — a
  freshly-installed nodejs needs a newer openssl. Upgrade everything, then
  re-run setup: `pkg upgrade -y` → `node -v` (should print a version) →
  `cd ~/galaxyvpn/worker && bash termux/setup.sh`.
- **Shortcuts don't appear in the widget** — they must be in `~/.shortcuts/` and
  executable. Re-run: `bash ~/galaxyvpn/worker/termux/setup.sh`.
- **"xray-knife not found"** — re-run setup; confirm with `xray-knife --help`.
  Without it the worker falls back to a weaker TCP-only check.
- **xray-knife installed but errors on every config** — the Android build may
  not run on your device; swap in the Linux arm64 build instead:
  `cd ~ && wget -O xk.zip https://github.com/lilendian0x00/xray-knife/releases/download/v10.0.0/Xray-knife-linux-arm64-v8a.zip && unzip -o xk.zip -d xk && cp xk/xray-knife $PREFIX/bin/xray-knife && chmod +x $PREFIX/bin/xray-knife`
- **Upload hangs / "VPN seems down"** — turn your VPN back ON; it auto-retries.
- **Phone sleeps mid-scan** — the shortcuts take a `termux-wake-lock`; also
  disable battery optimization for Termux in Android settings.
- **Does the admin dashboard trigger my phone?** No — by design. The phone
  shortcuts run directly and do **not** listen to the dashboard's requests
  (`sync_requests`); those reach **only the PC worker**. The PC and the phone
  never trigger each other. ⚠️ Do **not** run `npm start` on the phone — that
  would make it listen to the dashboard and double-run with the PC. The phone is
  meant to use the one-shot shortcuts only.
