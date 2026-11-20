# Release requirements

The source is implemented and buildable; these owner/environment tasks remain before public release. Nothing in this document implies they have already been done.

## Business configuration

- Complete the legal entity, operator contact/support address, privacy contact, records retention, complaints procedure, marketplace terms and applicable legal documents. The current privacy/terms screens describe actual software behaviour and explicitly identify missing operator details.
- Confirm listing rules, review staffing and how buyers/sellers report abuse. This release has manual review and an audit log but no automated identity checks or dedicated user abuse-report queue.
- Private advertisements retain R500 / 30 days. Configure and test the hosted Payfast integration for the website/PWA. Native paid-ad purchases remain blocked pending store billing implementation; do not submit them as release-complete. See docs/live-push-payments.md.
- Populate verified real stock; correct and approve the legacy migration records before making them public. The existing production site and database have not been changed.

## Infrastructure

- Use a maintained Node 24.x runtime, HTTPS, the exact allowed WEB_ORIGIN, an absolute persistent DATA_DIR and SMTP credentials. Configure MAIL_FROM with your verified sending domain. Verify SPF/DKIM/DMARC and recovery/verification links through your provider.
- Keep the API and PWA at the same public origin. The provided build uses same-origin API requests and CSP. For separate web/API domains, deliberately configure the client URL, CSP, CORS and cookie policy together and retest.
- Create an administrator with your own credentials; never ship a shared admin account. Restrict operator/server access.
- Configure encrypted backups, restore drills, disk-space monitoring, process restart, log rotation and error monitoring. Database/media volume loss is data loss.
- Apply edge anti-abuse controls for public traffic and validate trusted proxy headers. In-memory rate limiting assumes one serving instance.
- Run a fresh dependency audit before release and review all advisories/overrides. The root manifest records selected patched transitive versions; revalidate these as the ecosystem changes.

## Native distribution

- Set your own bundle/package identifiers and Expo project, owner and EAS project ID. Set the production HTTPS EXPO_PUBLIC_API_URL in the EAS build environment. Do not build release clients against localhost.
- Use Apple/Google developer accounts to sign builds and prepare screenshots, descriptions, support/privacy URLs, privacy/data-safety declarations and app-review credentials where needed. These cannot be substituted by a JavaScript bundle export.
- Test on physical iOS and Android devices: signup/login/logout, photos and denied permissions, interrupted uploads, network errors, keyboard behaviour, enquiries, deletion, password reset and accessibility scaling. Test different screen sizes and slow networks.
- Configure universal links/app links only after domain association and signing identifiers are available. The website-based email verification/recovery flow works independently; custom app-scheme handling is implemented but does not claim domain association.
- Push delivery clients, a durable outbox and device/browser opt-in are implemented. Configure APNs/FCM/EAS and persistent VAPID credentials and validate physical-device delivery. Expo Go cannot test remote push. Saved-search bookmarks currently have no matching-stock alerts.

## Web acceptance

- Test desktop and mobile Safari/Chrome, PWA installation, offline error behaviour, service worker update lifecycle and deep links.
- Review input labels, keyboard focus, contrast, screen-reader output and reduced-motion behaviour with real assistive technology.
- Run the listing lifecycle with your real staff: rejection with a reason, corrected submission, approval, enquiries, featured placement and sold/deleted inventory.
- Verify public metadata, sitemap, canonical domain and HTTPS after deploying. Keep staging deployments out of search indexes via your proxy/hosting settings.

## Go-live sequence

1. Configure and deploy a private staging environment using a durable volume.
2. Provision your administrator and seller accounts; test mail delivery and native devices.
3. Correct and import legacy stock with receipt tracking, review and publish real listings.
4. Complete legal/business material and operational checks.
5. Build signed native releases and submit through your accounts.
6. Point the public domain to the tested service. Preserve the old system and backup as a rollback path; no DNS changes were made here.

## TestFlight preparation — 19 November 2026

The linked Expo project is `@ryanthomas3110/autocars`, bundle ID `za.co.autocars.app`. The production profile explicitly uses App Store distribution with the development client disabled. The existing EAS iOS builds inspected during this task were internal development builds and cannot be submitted to TestFlight.

Before starting the store build, deploy this API at a public HTTPS origin and set `EXPO_PUBLIC_API_URL` in the Expo **production** environment. The inspected production environment had no variables. Do not point this value at the old website unless it actually serves the current API, and do not use a Mac LAN address. Verify `/api/health` and the current platform endpoints at the chosen origin first.

From `apps/mobile`, after setting the verified origin:

```sh
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://YOUR_ACTUAL_API_ORIGIN --environment production --visibility plaintext
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Apple authentication and any two-factor codes belong in the local EAS/App Store Connect flow, not in chat. If an app record exists, set `submit.production.ios.ascAppId` to its numeric Apple ID. Otherwise EAS can guide the owner through creating the record at first submission. Do not invent an Apple ID or use the Expo project UUID in that field.

An upload goes to App Store Connect/TestFlight; it does not publish the app publicly. After Apple processes it, add it to an internal TestFlight group and invite the intended testers. External testing may require Beta App Review. See [Expo's TestFlight guide](https://docs.expo.dev/submit/testflight/).

## Render walkthrough for api.autocars.co.za

The supplied `render.yaml` was validated against Render's current Blueprint schema. It provisions one Starter Docker web service in Frankfurt and a 5 GB disk at `/data`, with `/api/health` for health checks. SMTP and push-key values are supplied privately at creation. `.env.render` is an ignored, owner-readable file containing deployment settings and the existing local VAPID pair; fill in SMTP_URL and MAIL_FROM before use. It must never be uploaded to the repository.

1. Sign in to GitHub Desktop and use File → Add Local Repository to add `/Users/zoedaniels/Desktop/AutoCars`. Review/commit the current source changes, then Publish Repository with Keep this code private checked. The branch is `main`; no remote was configured at inspection.
2. Sign in to Render using GitHub. Choose New → Blueprint and connect only the AutoCars repository. Use branch `main` and Blueprint path `render.yaml`.
3. Supply the prompted SMTP_URL, MAIL_FROM, WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY privately. Copy the push values from `.env.render`. SMTP_URL must be a working SMTP connection URI and MAIL_FROM an address authorised by that mail provider. Production startup intentionally fails without these values.
4. Review the paid service/disk charge, then Deploy Blueprint. This step creates a new hosted database and upload directory; existing local accounts and inventory remain local unless separately migrated. The service builds the entire repo-root Dockerfile, including the web/admin interface. Auto-deploy on code pushes is off; later releases use Manual Deploy.
5. After the service is live, add `api.autocars.co.za` under its Settings → Custom Domains. In the DNS zone for `autocars.co.za`, create a CNAME whose host is `api` and whose target is the exact assigned `*.onrender.com` hostname shown by Render. Do not include `https://` or a path in the CNAME target. Use the Render verification instructions for the actual DNS provider. Verify the domain in Render and wait for its TLS certificate.
6. Open `https://api.autocars.co.za/api/health`; it must return `{"ok":true}`. Also check `/api/config` identifies AutoCars. The current PWA/admin is available on that host as well, so WEB_ORIGIN is set to this HTTPS origin. Initialise a new production administrator using the Render Shell: `cd /app` then `npm run admin`. Test signup/email verification, uploads and an enquiry before building the phone app.
7. Set the Expo production EXPO_PUBLIC_API_URL to `https://api.autocars.co.za`, then build/submit using the production command above. The submission profile now targets the owner's existing App Store Connect app **6759597993**.
8. In App Store Connect, open AutoCars → TestFlight. After processing/compliance, add the build to an internal testing group and invite the testers. Use external testing/Beta App Review for testers outside the App Store Connect team.

Render automatically supplies/renews HTTPS certificates after custom-domain verification. A paid disk is required for this SQLite/media design; do not switch to an ephemeral free instance. Keep a single API instance until a shared database/event bus is introduced. Configure external backups and test restore before broader release; local database/media have not been uploaded by this task.

Docker Desktop was not running, so no new local Docker image build was performed in this preparation. The app's TypeScript/tests/builds/native exports and the Blueprint schema check passed. No Render service, DNS record or App Store upload has been created by the agent at this point.

## Preferred hosting route: Vultr with the existing WHM DNS

The owner prefers Vultr and Google Workspace. The Render walkthrough above is an alternative, not a required dependency. Prepared `compose.vultr.yml` uses one persistent API container and an optional `https` profile with Caddy. `deploy/Caddyfile` reverse-proxies HTTP and WebSocket traffic. Private `.env.vultr` preserves the locally prepared push keys, is ignored by Git, and still needs the real mail settings and final target domain. Docker Compose configuration validation passed without starting containers.

Read-only checks found that autocars.co.za, futurerent.co.za and api.autocars.co.za currently resolve to 139.84.232.139, using ns1.core.futurerent.cloud / ns2.core.futurerent.cloud. WHM root access and Terminal are present. The open AutoCars cPanel account offers PHP tools but no visible Node Application Manager. The existing API subdomain already returns Express responses behind Apache and does not implement the new `/api/health` endpoint. It must not be used as the TestFlight API origin until the current platform has actually been deployed there. A separate beta hostname is recommended for acceptance testing; the owner must choose this or a deliberate API cutover.

The private repository FutureRentDev/api.autocars.co.za contains an existing legacy backend and multiple branches. Publish the new monorepo on a separate reviewed branch/repository rather than overwriting the legacy branches. A local Git remote has not been configured, and terminal GitHub authentication was unavailable; no source was pushed.

For a fresh dedicated Vultr instance:

1. Choose an Ubuntu 24.04 LTS x86-64 instance with at least 2 GB RAM. Review the actual Vultr price before creating it. Record its public IPv4 address.
2. Install Docker Engine and the Compose plugin using Docker's official Ubuntu instructions. Keep SSH restricted to the intended administrators; allow inbound TCP 80/443 for HTTPS. This guide does not install or modify anything on the existing WHM server.
3. Clone the branch containing this current monorepo onto the new server. The repo root contains package.json, Dockerfile, apps and packages; cloning only the legacy repo branch will not deploy this app.
4. Transfer/fill `.env.vultr` privately. Set AUTOCARS_DOMAIN to the chosen host, WEB_ORIGIN to its HTTPS origin, SMTP_URL to the working Google Workspace transport, and MAIL_FROM to the authorised mailbox. Keep the file mode 0600.
5. In the existing WHM DNS Zone Manager for autocars.co.za, add/edit only the chosen API hostname's A record to the fresh server IP. A separate beta hostname does not require changing the current API/website records. Verify DNS and any conflicting AAAA record for that hostname.
6. On the fresh server, from the repository root, run `docker compose --env-file .env.vultr -f compose.vultr.yml --profile https up -d --build`. Caddy obtains HTTPS when DNS and inbound 80/443 are ready. Do not use this HTTPS profile on the existing WHM host: its Apache already uses those ports. Reusing that host would require a separately reviewed Apache reverse-proxy configuration.
7. Verify the HTTPS `/api/health` endpoint and the current `/api/config`. Provision an administrator with `docker compose --env-file .env.vultr -f compose.vultr.yml exec autocars npm run admin`. The new disk starts empty; local users/listings do not migrate automatically.
8. Test email verification/recovery, photos, enquiries/chat and push on the new endpoint. Then set EXPO_PUBLIC_API_URL in the EAS production environment to that verified origin and build/submit to the configured App Store Connect app.

Google Workspace can send application mail using smtp.gmail.com over TLS on 465/587 with a mailbox app password, if the organisation permits app passwords and the account has 2-Step Verification enabled. For example, SMTP_URL follows `smtps://URL_ENCODED_MAILBOX:APP_PASSWORD@smtp.gmail.com:465`; MAIL_FROM must match an authorised sender. Workspace SMTP relay is an alternative requiring Google administrator configuration. Do not use the normal Google login password or commit mail credentials. The domain's MX already points to Google; this alone does not verify mailbox status, SMTP authorisation, SPF or DKIM. Verify those in Workspace before acceptance testing.

References: https://docs.docker.com/engine/install/ubuntu/ ; https://caddyserver.com/docs/automatic-https ; https://docs.cpanel.net/whm/dns-functions/dns-zone-manager/ ; https://support.google.com/accounts/answer/185833/sign-in-with-app-passwords .

The owner selected `beta-api.autocars.co.za` for the new TestFlight backend. The Vultr Compose default and private `.env.vultr` now use that hostname. Existing API/website DNS records and server services were not modified. Compose validation passed without starting containers. Deployment planning now uses a fresh Vultr instance; review the existing hosting environment separately before reusing it. Configure the beta A record only after the fresh server IP is known, then verify HTTPS `/api/health` before setting EAS production EXPO_PUBLIC_API_URL.
