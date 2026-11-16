# Architecture & operations

## Repository

- `apps/api/src/app.ts`: API assembly, authentication, validation, marketplace workflows, moderation and production web serving.
- `apps/api/src/db.ts`: versioned schema creation, indexes, WAL mode and foreign-key enforcement.
- `apps/web/src`: responsive React storefront, account, seller and administrator UI.
- `apps/mobile/App.tsx`: native Expo application; `apps/mobile/src/api-url.ts` resolves Expo Go network addresses; `app.config.ts` reads the shared brand.
- `packages/core/src/index.ts`: shared models, constants, API transport, currency formatting and finance calculation.
- `config/brand.json`: deployment-wide brand and application identifiers.
- `migration/legacy-inventory.json`: public source records staged for human correction.

The web and native apps share the API and domain definitions; each has its own presentation components. There is no hosted third-party backend subscription or dependency on ChatGPT identity. The native app is a React Native application with native inputs, views, image selection and secure token storage.

## Persistence & scale

SQLite is on the API server's persistent local disk, with WAL, prepared statements, indexed public search and database-side pagination. Uploaded images are on that same persistent volume. This topology supports a **single API instance**, not a horizontally scaled serverless deployment. Do not run separate replicas with independent SQLite files. For a large marketplace, move repositories to managed PostgreSQL, photos to object storage/CDN, sessions/rate limiting to shared infrastructure, and load-test against the intended traffic. Those scale services are not provisioned here.

The schema bootstrap records version 1 in `migrations`. New schema changes should be added as explicit, transactional migrations; never drop or re-seed production tables. Dates are stored as UTC ISO strings. The clients display South African locale/currency, and the server validates the current model year.

Administrator inventory, enquiry and user lists are capped at 1,000 records, audit at 200. Public inventory is paginated at 18 per page. Add paginated admin browsing before operating beyond those caps.

## Identity & access

Passwords use random salts and scrypt, with timing-safe comparison. Random session tokens expire after 30 days and are hashed in the database. Logout revokes the current session; resetting a password revokes all sessions. Expired sessions are cleaned when issuing a new session. Verification and recovery tokens expire after one hour and are hashed/single use.

Web uses an HTTP-only, SameSite=Lax session cookie, Secure in production. The native app requests a bearer token and stores it in Expo SecureStore; mobile login does not issue a web cookie. Write requests validate supplied origins, and cookie-authenticated writes require an allowed Origin header. Public endpoints do not accept arbitrary SQL sort/column input.

The first administrator is provisioned interactively on the server. Registration always creates an ordinary user; role escalation is not exposed in the API. Ownership checks govern edits, sold state, deletions, uploads, searches, favourites and leads. Administrator moderation is recorded in an audit table.

## Listings & media

Lifecycle: `pending → published / rejected`; owner edits return a listing to pending; sold listings leave public results. A review records a reason when rejected. Featuring only applies to published inventory. Publishing is a human review, not a mechanical/identity certification.

Uploads require authentication, limit individual source files to 8 MB and 40 megapixels, and decode/re-encode with Sharp to WebP (maximum 1920×1440, metadata removed). Allowed MIME declarations are checked and the content must actually decode. Sellers can only attach their own uploaded files. Upload rate limits are 30 per 15 minutes for ordinary accounts and 500 for administrators performing migrations. The application caps a listing at 12 photos and an account at 300 uploads. Unused photos can be deleted through the upload API. Photos on an active listing cannot be deleted until detached.

Public listing responses omit the seller phone field. Enquiries share the buyer's submitted contact details with the listing owner. Do not put personal information into public descriptions/photos. Pending photos have unguessable UUID URLs but are not individually authenticated; do not upload private documents.

## Email & external services

SMTP is operator-supplied. New enquiry records commit before a best-effort email notification; a mail delivery failure does not lose the enquiry. Verification emails are best effort on registration and can be resent. Recovery requests require configured email. This initial release does not have a durable mail queue or background retry worker; monitor delivery errors and add one if guaranteed delivery is required.

No production integrations, emails, payments or push notifications were sent during implementation. `compose.dev.yml` provides an optional local Mailpit SMTP inbox, started only by the operator. There is no lender decision engine, valuation provider or direct vehicle transaction handling.

## PWA & SEO

Vite PWA generates the manifest, service worker and precached app shell. Account/API responses and inventory are not cached for offline use. A saved offline page cannot submit actions; the live API must be reachable. Browser updates use the service worker's normal waiting lifecycle rather than forcing a reload during forms.

The production API serves the built SPA and vehicle-specific title, canonical URL, Open Graph metadata and Schema.org Car/Offer JSON. It also serves robots and sitemap endpoints. The site does not currently render the entire catalogue server-side; add SSR/prerendering if required by your acquisition strategy. Vite's development server does not exercise production SEO routes.

## Backups & restore

```sh
npm run backup /ABSOLUTE/PATH/OUTSIDE/DATA/backup-2026-11-15
```

The destination must not exist. The utility uses SQLite's online backup API and copies uploads. Pause listing/photo writes or stop the serving process while backing up for a consistent database/media pair. Encrypt and restrict access to backups; they contain personal information. Automate off-host backups, retention, monitoring and a restore exercise on your own infrastructure.

To restore, stop the API, restore `autocars.sqlite` and the `uploads` directory to an empty DATA_DIR, ensure the service account owns them, then restart and verify login/listing/media access. Do not mix a restored database with a different set of WAL files from a running database. Keep the pre-restore data as a rollback backup.

## Source assets

- Logo: supplied by the user (`Graphic Copy.png`), preserved in web and native assets.
- Editorial hero image: `https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2000&q=85`. It is used as editorial imagery, never represented as inventory. Confirm third-party asset rights before release or replace with your own photography.
- Category silhouettes and app icon: source SVG code in this repository, editable and brandable.
- UI icons: Lucide (web), system/native text symbols (mobile); no external font requests.

## Verification limits

Automated integration tests run against an isolated temporary database and generated test-only images; those records are removed after the test. The deliverable database is not seeded. The tests cover real HTTP handlers, access control, persistence, upload decoding, listing lifecycle, enquiries and privacy operations. They do not substitute for a penetration test, real device QA, accessibility audit or load test. The Docker image build has passed without starting a container. SMTP provider deliverability, physical devices, signed native binaries and stores still require your deployment environment. See `docs/verification.md`.


## Current live, push and checkout implementation

See `docs/live-push-payments.md` for the reconciled WebSocket invalidations, additive migrations, business account gating, notification outbox and Payfast hosted checkout. Native paid listing purchases remain a store-billing release blocker. Legacy simulator tables are preserved for existing data but are no longer used to authorise new advertisements.
