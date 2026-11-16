# Verification — 16 November 2026

This report distinguishes automated checks from tests requiring the owner's devices and production accounts. The agent did not start or stop the owner's API, website or Expo servers. Build commands generated bundles; HTTP/WebSocket tests ran in process without listening on a port.

## Passed on the reconciled source

- `npm run check`: completed successfully, including all workspace TypeScript checks.
- **18 automated tests**: three launcher/network tests and fifteen API/client/native-configuration tests. Coverage includes ownership/moderation, persistence, business activation, authenticated WebSocket upgrades and session revocation, scoped live updates, durable push delivery/retries/stale devices, hosted checkout signing and payment verification, duplicate payment fulfilment, uploads, recovery/verification and privacy controls.
- Production web/PWA build and custom service-worker generation.
- PWA checks: manifest identity/scope/icons, push display and safe notification click routing. The built worker is executed in a test harness; this is not proof of delivery to a browser through a push provider.
- Expo SDK dependency compatibility and iOS/Android JavaScript/Hermes exports. These are not signed store binaries or physical-device tests.
- Dependency audit: **zero known vulnerabilities** at verification time.
- Expo Doctor: **20/20 checks passed** after the TypeScript dependency update.
- Read-only checks against the owner's existing servers: API health returned OK and the website served the standalone manifest with 192px, 512px and maskable icons.
- Local VAPID keys were prepared without printing secrets. Existing data is retained through additive migrations.

Follow-up: corrected the shared live client's startup/cleanup to avoid discarded React development mounts opening WebSocket handshakes, and to close pending connections only after their handshake completes. Workspace TypeScript checks and all **19 tests** passed, including a new lifecycle regression test. Direct and Vite-proxied WebSocket connections on the owner's existing servers both returned `ready` and `pong`.

Earlier checks also covered Docker image construction, containerised tests and backup integrity. Those checks preceded the latest payment/push reconciliation; the final source was checked with the command above rather than rebuilding the Docker image again.

## Owner/device verification and release work remaining

- Physical Android/iOS Expo Go testing of supported workflows. Remote native push requires a signed development/production build, Expo project ownership and APNs/FCM credentials.
- Actual browser installation/address-bar UI and push delivery on supported HTTPS/localhost contexts. Browser UI could not be inspected in this environment. A manifest alone does not guarantee Chrome will show its icon in every profile.
- Payfast merchant credentials and public HTTPS staging callback acceptance, followed by a live merchant test. No real payment was taken. Sandbox/provider verification is not replaced by the test transport used in automated tests.
- **Native paid-advertisement store billing remains unimplemented and purchases are blocked.** Implement appropriate store products, server receipt validation and fulfilment before releasing native paid listing purchases.
- SMTP delivery, actual photo picking, local-network permissions, accessibility, keyboards and slow-network behaviour on the owner's devices.
- Operator/legal details, real inventory, HTTPS deployment, signing, store review, refund/reconciliation procedures and production backup/restore acceptance.

See [setup and remaining release requirements](live-push-payments.md) and [Expo Go commands](expo-go.md). No claim is made that these owner/device checks have already happened.
