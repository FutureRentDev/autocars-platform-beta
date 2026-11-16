# Test AutoCars in Expo Go on iPhone and Android

AutoCars targets Expo SDK 58. Its native dependencies are compatible with the matching Expo Go release. The launcher explicitly uses Expo Go, even though `expo-dev-client` is also installed for future standalone development builds.

No AutoCars API, web, Metro or email server is started by setup/check commands. Start them yourself with the commands below.

## 1. One-time setup

From the project root:

```sh
cd /Users/zoedaniels/Desktop/AutoCars
npm ci
npm run setup:local
npm run admin
npm run expo:login
```

`setup:local` preserves an existing `.env` and otherwise copies `.env.example`; it does not create default accounts. `admin` asks you to choose your own email, name and password. Only run it once per administrator address.

Install/update [Expo Go](https://expo.dev/go) on both phones. On a physical iPhone, sign in to Expo Go with **the same Expo account** used by `npm run expo:login`. This is required by [the current Expo Go iOS workflow](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/). Android does not have that same-account requirement, but using the same account is convenient.

Your computer and phones must be on the same reachable Wi-Fi network. Guest networks with device isolation, VPN routing and firewall rules can block access.

## 2. Start the real API and website — terminal 1

```sh
cd /Users/zoedaniels/Desktop/AutoCars
npm run dev
```

Leave that terminal running:

- Website/admin on your Mac: `http://localhost:5173`
- API on your Mac: `http://localhost:4000/api/health`
- On either phone, open the API health URL using the Mac address printed by the next command, e.g. `http://192.168.1.45:4000/api/health`. It should return `{"ok":true}`.
- Development API origins include this computer's local addresses automatically. Production origins remain explicitly configured.

## 3. Start Expo Go — terminal 2

```sh
cd /Users/zoedaniels/Desktop/AutoCars
npm run mobile
```

The launcher detects your Mac's LAN IPv4 address, sets `EXPO_PUBLIC_API_URL`, selects Expo Go, and uses Metro port **8082** so an unrelated Expo project on 8081 can stay running.

- **Android:** open Expo Go and scan the terminal QR code using its QR scanner.
- **iPhone:** scan the QR code using the Camera app and open it in Expo Go. If asked, allow Local Network access for Expo Go. Sign in with the same Expo account as the CLI.
- Both devices connect to the same API, accounts, database and real uploaded inventory. You can keep both open at the same time.

A standalone app is not necessary for this Expo Go test. App icons, native splash configuration, app-store signing and native permission text need a standalone build to validate; Expo Go has its own native application configuration.

## 4. Exercise the actual workflow

1. Sign in as your administrator on the website. Keep a separate ordinary buyer/seller account for role checks.
2. For Expo Go listing submission, use an AutoCars admin account or an activated business account. Private customer advertisements require secure web checkout; native paid-listing purchases remain blocked pending store billing implementation.
3. On the website, open Admin workspace → inventory. Inspect the listing and approve it, or reject it with a reason and resubmit a corrected version.
4. On the second phone, sign in as a different buyer. Search/filter the published listing, open all photos, save it, compare it and send an enquiry.
5. Back on the seller phone, open Inbox, contact the buyer and update the enquiry status. Editing the listing requires another approval. Marking it sold removes it from public results.
6. Close and reopen Expo Go to verify the saved session. Test poor connectivity and retry without losing a valid session.
7. Use disposable accounts you create yourself to test export and permanent account deletion.

Remote push also requires your own signed development build; Expo Go can test live foreground updates. See `docs/live-push-payments.md`.

The application does not seed fake stock or fake accounts. An empty marketplace is expected until you add and approve genuine inventory.

## Optional: test email locally without a production mail provider

The optional Mailpit service receives real SMTP messages into a local test inbox. It does **not** send to real recipients. Docker Desktop must already be available.

```sh
# Start the local inbox yourself.
npm run mail:start

# Use this instead of npm run dev in terminal 1.
npm run dev:mail

# Terminal 2 remains the same.
npm run mobile
```

Open `http://localhost:8025` on your Mac to read verification, recovery and enquiry notifications. The local email command gives links your Mac's LAN website address so you can also copy/open those links on a phone. It overrides SMTP only for its child processes and does not change your production credentials.

SMTP and inbox ports are bound to loopback; no email inbox is exposed to your Wi-Fi. Verify/recover through the web link, then return to the native app and sign in. Universal links back into a signed native app need your domain association setup.

Stop with Ctrl+C in both app terminals, then `npm run mail:stop`. The local email volume persists unless you explicitly remove it.

## Network overrides & troubleshooting

To preview exactly what the launcher will do without starting anything:

```sh
npm run mobile -- --dry-run
```

If the wrong adapter is selected:

```sh
AUTOCARS_DEV_HOST=192.168.1.45 npm run mobile
```

Use the current Mac Wi-Fi IP; the example above is not permanently hardcoded. The launcher recalculates the address on each run. If you use a different API port, set `PORT` in `.env` and restart the API and Expo.

To use a deployed HTTPS API:

```sh
EXPO_PUBLIC_API_URL=https://YOUR_API_DOMAIN npm run mobile
```

If another process uses Metro 8082:

```sh
npm run mobile -- --port 8083
```

If Metro's connection is blocked, Expo can tunnel the bundle:

```sh
npm run mobile:tunnel
```

The tunnel is **only for Metro**, not the API. The phone must still reach the printed API address over Wi-Fi, or you must set a deployed/reachable HTTPS API origin. Expo CLI may offer to install its official tunnel helper; no global tunnel service has been started or installed by this project setup.

If the app opens but inventory/sign-in fails, first check the printed `/api/health` address from the phone's browser. A localhost API URL refers to the phone itself, not your Mac. Allow Node's incoming network access if macOS asks, verify both devices are on the same non-isolated network, and check VPN settings. Do not disable your firewall wholesale.

When switching API origins, reload Expo Go or restart the launcher. Existing tokens belong to the original API database; sign in again if switching to a different database.

If Expo reports an SDK mismatch, update Expo Go to the version supporting SDK 58. Download the supported release from [Expo's official page](https://expo.dev/go). If iOS reports an account mismatch, use `npm run expo:login` and the matching Expo Go account. For stale bundles, run `npm run mobile -- --clear`.

## Automated checks without a serving process

```sh
npm run check
```

This runs TypeScript, launcher/transport/marketplace tests, the PWA production build, Expo package compatibility, iOS/Android bundle export and a dependency audit. Tests use in-process HTTP injection and temporary test data, not a listening API server. Bundle exports terminate when complete; they are not Expo Go or signed-device test results.

Production release still needs your HTTPS hosting, email/domain configuration, legal business details, corrected stock, Apple/Google/Expo project credentials and physical-device acceptance. See `docs/release.md` for that distinct release work.
