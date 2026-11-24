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

Native push follow-up: the owner installed an iOS development build and registered one Expo device. A single diagnostic notification was queued through the existing API worker. Expo returned a ticket and an `ok` receipt, confirming handoff to the platform push service. The owner confirmed that this notification arrived on the iPhone, verifying end-to-end native push for that installed development build. Other devices and notification-event workflows still require acceptance testing. The test endpoint now rejects accounts with no registered device rather than claiming a push was queued; API TypeScript checks and both live/push tests passed after that change.

Chat follow-up: corrected staff-message recipients. Staff outside the buyer/seller pair previously notified only the buyer, missing the seller's registered iPhone. Staff messages now notify both participants except the sender; participant replies notify only the other party. API TypeScript and all three live/push tests passed, including browser-cookie staff messaging, recipient-specific queued delivery and rejection of unrelated users. Physical-device confirmation of this specific chat workflow remains pending.

Android/rendering follow-up: removed a literal space outside a native Text container in the authentication fragment and added a source check covering fragments. Android cloud builds now reject missing or mismatched Firebase client files and native registration reports actionable Firebase setup instructions. Expo config evaluation confirms the correct EAS project and Android package, but no local AutoCars Firebase client file is configured. Workspace TypeScript, **24 tests** (7 tooling + 17 API/client/config tests), and both native exports passed. A Firebase-enabled Android APK and physical-device push acceptance remain pending the owner's AutoCars Firebase configuration/FCM credential.

Notification routing/home follow-up: new chat/enquiry pushes include exact conversation paths, listing alerts identify the vehicle, and business/payment notifications identify their destination. Native handlers queue destinations until authentication is ready; a PWA chat route and sign-in return paths are implemented. The native header logo returns to unfiltered Explore at the top. `npm run check` passed with **26 tests** (7 tooling + 19 API/client/config tests), web/PWA build and worker checks, both native exports, SDK dependency compatibility and zero audit vulnerabilities. Tests verify emitted chat paths and safe route parsing. Physical-device tap navigation remains an owner acceptance check; older delivered pushes retain their original generic paths.

Earlier checks also covered Docker image construction, containerised tests and backup integrity. Those checks preceded the latest payment/push reconciliation; the final source was checked with the command above rather than rebuilding the Docker image again.

## Owner/device verification and release work remaining

- Physical Android/iOS Expo Go testing of supported workflows. Remote native push requires a signed development/production build, Expo project ownership and APNs/FCM credentials.
- Actual browser installation/address-bar UI and push delivery on supported HTTPS/localhost contexts. Browser UI could not be inspected in this environment. A manifest alone does not guarantee Chrome will show its icon in every profile.
- Payfast merchant credentials and public HTTPS staging callback acceptance, followed by a live merchant test. No real payment was taken. Sandbox/provider verification is not replaced by the test transport used in automated tests.
- **Native paid-advertisement store billing remains unimplemented and purchases are blocked.** Implement appropriate store products, server receipt validation and fulfilment before releasing native paid listing purchases.
- SMTP delivery, actual photo picking, local-network permissions, accessibility, keyboards and slow-network behaviour on the owner's devices.
- Operator/legal details, real inventory, HTTPS deployment, signing, store review, refund/reconciliation procedures and production backup/restore acceptance.

See [setup and remaining release requirements](live-push-payments.md) and [Expo Go commands](expo-go.md). No claim is made that these owner/device checks have already happened.


## Follow-up — 17 November 2026

`npm run check` passed: TypeScript, **27 tests** (7 tooling + 20 API/client/config), web/PWA build and worker checks, SDK compatibility, both native exports and zero known audit vulnerabilities. Tests cover notification permission before asynchronous networking, existing browser registration restoration, preserving queued deliveries on device reconnect, private inbox counts/read-state, joined staff reply notifications and the latest 500 messages in long conversations. A final native-only scroll adjustment was typechecked and re-exported afterward.

Chat keyboard/scroll layout and the new global PWA Inbox badge still require physical-device/browser acceptance. The running API's read-only health and push-configuration checks succeeded; web push is enabled, but no browser subscription was present at inspection, so real browser delivery has not been claimed. No serving process was started or stopped by this follow-up.

Enquiry-thread follow-up: `npm run check` passed with 27 tests after adding the derived opening enquiry, seller-only enquiry push recipients (including an admin as sender), and vehicle metadata for linked chat subjects. Existing-thread rendering, no repeated opening message and original-enquiry retention in long histories are asserted. A final iOS modal handoff adjustment then passed mobile TypeScript, all seven tooling checks and both native exports. Chat-title navigation on physical devices remains an owner acceptance check.

## TestFlight/hosting preparation — 19 November 2026

Production EAS profile now explicitly uses store distribution with the dev client disabled and targets App Store Connect app 6759597993. Expo authentication was verified for the linked owner; the two existing iOS EAS builds were internal development builds, and the production EAS environment had no variables. No cloud build or Apple submission was started without a working backend URL.

Updated Expo to the SDK-recommended 58.0.26 and expo-dev-client 58.0.21. The complete `npm run check` then passed: 27 tests, TypeScript, web/PWA and worker verification, SDK compatibility, both native exports and zero known audit vulnerabilities. The current number-input source preserves empty strings while editing and converts at validation/submission.

Prepared `render.yaml` and validated it against Render's official JSON Schema (2020-12). It defines a persistent single-instance Docker service for api.autocars.co.za. Private `.env.render` was created with mode 0600, verified ignored by Git, and contains no SMTP credentials yet. Secret values were not printed. Docker daemon was unavailable, so this final Docker source was not rebuilt locally. Hosting, DNS, SMTP and production physical-device acceptance remain pending the owner's setup.

## Transparent logo and original A icons — 24 November 2026

Synced the user's transparent PWA wordmark to the native header and splash, removed the native header's black logo backing, and regenerated icons from the actual opening A pixels in `apps/mobile/assets/autologo.png`. The original source is preserved; its black backing is converted to alpha only in generated monogram assets. iOS launcher/PWA/Apple touch icons have opaque backgrounds; Android adaptive/themed foregrounds and notification badges are transparent. The favicon embeds the cropped source artwork instead of the previous approximate vector drawing. PWA icon URLs include a content revision, and the worker recognises those URLs offline.

Verified the generated icon visually, checked output sizes/alpha, confirmed that the native and web wordmarks are byte-identical, and measured the adaptive/maskable artwork inside the platform safe circles. Mobile TypeScript and both native exports passed. Web production build and the existing PWA manifest/worker checks passed after adding versioned icon URLs. No serving process, EAS build, upload or deployment was started by this change. Existing installations require new native builds and a web deployment; installed PWA icon refresh timing remains browser-controlled.
