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
