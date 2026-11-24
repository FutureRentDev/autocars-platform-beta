# AutoCars

An owned-source, white-label car marketplace: a React web/PWA storefront and administration workspace, Expo native iOS/Android apps, and a shared Fastify API with a persistent SQLite database. Black-and-white branding uses the supplied AutoCars logo.

There are no seeded cars, default credentials, fabricated valuations, simulated enquiries, or mock backend responses. New inventory is entered by sellers and reviewed by an administrator. This is an implemented initial marketplace release, **not a claim that every feature of AutoTrader or Cars.co.za has been reproduced or that app-store release has been certified**.

## Start locally

Use Node 24.4+ (24.x), npm 11+.

```sh
npm ci
npm run setup:local
npm run admin
npm run dev
```

- Website: http://localhost:5173
- API: http://localhost:4000/api/health
- Sign in with the administrator you created, then open **Admin workspace**.
- Register a seller account, upload a real car, submit it, then approve it from the administrator account. An administrator can also list its own cars.
- Development data lives in `apps/api/data/` unless `DATA_DIR` is absolute. It is ignored by Git. Never replace it with a build directory.
- Without SMTP, development signup works, but email verification, password recovery and email notifications do not send mail. Production refuses to start without explicit HTTPS origins, SMTP and a sender address. Production sellers must verify email before submitting inventory.

## Expo Go on Android and iPhone

The local `.env` has been prepared without starting a server. See the full [two-phone testing guide](docs/expo-go.md).

```sh
# Once: dependencies, local config, your own administrator, Expo login.
npm ci
npm run setup:local
npm run admin
npm run expo:login

# Terminal 1: real API + website/admin.
npm run dev

# Terminal 2: Expo Go; auto-detects Mac Wi-Fi address, uses port 8082.
npm run mobile
```

Install SDK 58-compatible [Expo Go](https://expo.dev/go) on both phones. Use the same Wi-Fi network. On physical iOS, sign in to Expo Go with the same Expo account as the CLI. Scan the QR code with Expo Go on Android or Camera on iPhone. Your existing Expo project on port 8081 is untouched.

No Expo/API/web server is started by `npm run setup:local` or `npm run mobile -- --dry-run`. The mobile launcher supports `AUTOCARS_DEV_HOST` for adapter selection or `EXPO_PUBLIC_API_URL` for a remote API. `npm run mobile:tunnel` tunnels Metro only; your API must remain reachable separately.

The app uses native React Native views, SecureStore, real photo uploads, tabs, galleries, search, saved cars/searches, comparison, finance calculations, listing edits, enquiry management and account deletion. Administration is on the web.

For optional local verification/recovery emails, start the provided inbox with `npm run mail:start`, then use `npm run dev:mail` instead of `npm run dev`. Read messages at `http://localhost:8025`. This uses local SMTP and does not send to real recipients. See [email testing](docs/expo-go.md#optional-test-email-locally-without-a-production-mail-provider).

## Standalone native builds

`expo-dev-client` and EAS profiles are configured. Expo Go is sufficient for the local workflow; signed binaries require your Expo/Apple/Google accounts and real production service URLs.

```sh
npm run check
cd apps/mobile
npx eas-cli login
npx eas-cli init
# Configure EXPO_OWNER / EXPO_PROJECT_ID and the real HTTPS
# EXPO_PUBLIC_API_URL in your EAS environment before standalone builds.
npx eas-cli build --platform all --profile production
# Submit after physical-device QA and store metadata are complete.
npx eas-cli submit --platform all --profile production
```

Preview/production EAS builds deliberately fail early if the API URL is missing or an obvious placeholder. Current iOS and Android bundle exports, Expo dependency checks and automated tests have passed; physical-phone QA, SMTP deliverability and signed builds have not been performed. Custom-scheme links are supported; universal/app links require your association files and signing identifiers.

## Implemented workflows

| Area | Behaviour |
| --- | --- |
| Discovery | Keyword, make, price range, province, body style, fuel, transmission, year and mileage filters; database pagination and sorting |
| Listings | Up to 12 photos, gallery, specs, seller description, finance estimate, authenticated enquiries |
| Buyer account | Registration/login, favourites, saved-search bookmarks, up to three-car comparisons, data export/deletion |
| Seller | Create/edit listings, photo upload/removal, review status and rejection reasons, mark sold, delete, enquiry pipeline |
| Administration | Live counts, all inventory, approve/reject, feature, mark sold/delete, all-enquiry pipeline, user directory and audit trail |
| Security | scrypt passwords, hashed expiring server sessions, HTTP-only web cookies, native SecureStore, origin checks, validation, role/owner checks, rate limits and image re-encoding |
| Email | SMTP verification/recovery links and new-enquiry notifications when configured |
| PWA | Install manifest, supplied branding, icons, precached shell; live inventory/account actions need a connection |
| Search engines | Production sitemap, robots and server-rendered vehicle metadata/structured data; main website is a React SPA |

Saved searches are bookmarks and do not yet generate matching-stock alerts. Live updates, buyer/seller chat, customer/business applications, web/native push clients and the R500 hosted Payfast website checkout are implemented. See [live, PWA, push and payment setup](docs/live-push-payments.md).

**Release dependencies remain explicit:** native remote push needs your EAS/APNs/FCM credentials and a signed build; real checkout needs your merchant credentials and acceptance testing. Native paid advertisements are blocked pending store billing implementation. There is no credit-provider integration, automated valuation, VIN verification, dealer team membership, dealer inventory feed sync or editorial CMS.

## White labelling

1. Edit `config/brand.json`: name, tagline, slug, scheme, domain, support email, currency/locale, theme and application identifiers. The interface is dark-only: `primary` is the light accent colour and `background` the near-black page colour.
2. Replace the transparent wordmark at `apps/web/public/logo.png`; run `npm run brand:assets`. This single source supplies the native header/splash and the exact opening A pixels for iOS, Android adaptive icons, PWA icons, PNG/ICO favicons and notification badges. Generated launcher icons have solid backgrounds; adaptive foregrounds and notification badges retain transparency. Versioned icon filenames allow browsers to detect the changed artwork. Original source files, including `autologo.png`, are preserved.
3. Replace the hero image in `apps/web/public/hero.jpg` and `apps/mobile/assets/hero.jpg` if desired. Current editorial image: [Porsche photograph on Unsplash](https://images.unsplash.com/photo-1503376780353-7e6692767b70); source image URL is recorded in `docs/architecture.md`.
4. Set your environment and business/legal copy, rebuild web/native, and provision separate persistent storage and administrator accounts per deployment.

White labelling is **one independent deployment per brand**, not a multi-tenant SaaS with tenant routing or shared billing. You own the application source; third-party packages keep their own licences. See `LICENSE`.

## Production

```sh
npm run typecheck
npm test
npm run build
npm start
```

The API serves `apps/web/dist` and `/uploads` on port 4000 for a same-origin HTTPS reverse proxy. Set `WEB_ORIGIN=https://your-domain.co.za`, `NODE_ENV=production`, `SMTP_URL`, `MAIL_FROM`, and an absolute persistent `DATA_DIR`. Set `TRUST_PROXY=true` only behind a trusted proxy that overwrites forwarded headers. Do not expose the backend directly when trusting proxy headers.

`Dockerfile` and `compose.yml` are supplied for a single-instance deployment. Copy `.env.example` to `.env`, configure production values, use `docker compose up --build -d`, and terminate HTTPS in your reverse proxy. Provision the first administrator with `docker compose exec autocars npm run admin`. The `/data` volume must survive container replacement. Docker image build verification is recorded in `docs/verification.md`; no container or service is started by a build.

Read [release requirements](docs/release.md), [architecture and operations](docs/architecture.md), and [API reference](docs/api.md) before launch.

## Existing-site migration

`migration/legacy-inventory.json` is a read-only snapshot of seven public listings from the existing AutoCars API. The legacy feed has a year conflict and some missing photos, and does not provide required location/seller information. It has not been imported or altered.

```sh
npm run migration:prepare
# Fill each vehicle.required object, verify source warnings and availability.
# Set imageUrls to the photos you want imported (maximum 12).
IMPORT_API_URL=http://localhost:4000 npm run migration:import
```

The importer uses an existing owner's account (an administrator account is recommended for batch-upload limits), the same upload/validation endpoints as the clients, and submits listings for review. It never auto-publishes. Successful source IDs are stored in a receipt file to avoid repeating imports; keep that file. Partial photo uploads are cleaned up on failure. It does not migrate passwords, users, private records or historical leads; those require an authorised export from your current backend. No existing website or production database has been modified.
