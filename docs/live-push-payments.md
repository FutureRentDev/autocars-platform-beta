# Live updates, installation, notifications and paid advertisements

Updated 16 November 2026. These changes reconcile the original platform with Devin's additions. Existing accounts, listings, chat and business records are retained by additive migrations. No existing database is replaced or seeded.

## Live updates

The API exposes a WebSocket at `/api/live`. The website/PWA and native app use the same reconnecting client. Public catalogue changes go to all viewers; private inventory, enquiries, chat, saved searches, business decisions and notifications go only to the affected accounts and authorised AutoCars staff. The socket carries invalidations, not contact records or message content. HTTP endpoints still enforce ownership and roles when clients fetch current data.

Connections send heartbeats, reconnect with backoff, and resynchronise after reconnecting or returning to the foreground. Mobile background updates use push; a suspended app cannot promise a continuously running WebSocket. Draft form inputs are preserved while stored records update. A connection indicator shows Live or Reconnecting.

The deployment is still a single API instance. A reverse proxy must forward WebSocket Upgrade/Connection headers and permit long-lived connections. Multiple API replicas need a shared event bus and shared database, which are not provisioned by this local project.

## Admin and business accounts

Admin is an AutoCars owner/staff permission, not a public signup option. Admins can list vehicles without the private-advertisement fee and review their own inventory. Business sellers are separate ordinary users with a business account type.

Registration offers customer/private-seller or business/dealership. A business registration creates an application. The applicant can browse and enquire but cannot upload/list vehicles until staff record the concluded commercial agreement reference, confirm the agreement was reached outside the app, and activate selling. The application itself does not create a commission obligation or charge a percentage. Rejecting/suspending a business removes its published vehicles from public search; activating it does not automatically republish stock.

## PWA installation

The web app now has a stable manifest ID/scope, standalone display, real 192/512 icons, a maskable icon, Apple touch icon, service worker, offline shell and browser install-prompt handling. PWA functionality is also enabled on the Vite development server.

For Chrome on this Mac, use **http://localhost:5173**. A plain HTTP address such as `http://192.168.1.45:5173` on another device is not a secure context, so full PWA install/push features are not available there. Use HTTPS for phone/browser PWA testing and production.

Chrome controls its address-bar install UI. A qualifying app may show Install, Open app if already installed, or an option in its menu. User engagement, browser policies, incognito mode and previous dismissal can affect the offer. The website also has an Install app button that invokes the native browser prompt when available and otherwise gives the correct browser-specific steps. No website can force Chrome to display an address-bar icon.

The new worker handles push messages and notification clicks. Click targets are restricted to same-origin app paths. API/account data is not cached for offline access. When an updated worker is waiting, the page offers Reload and tells the user to save edits first.

## Web push

Run once if keys have not already been prepared:

```sh
npm run setup:push
```

This preserves an existing complete pair, or saves a VAPID key pair to `.env` with restricted permissions. The private key is not printed and must stay server-side. Preserve the pair across deployments; changing keys requires browsers to re-register. Setup during this task has already prepared local keys.

Restart the API yourself after environment changes. Sign in on the website/PWA, open Account → Notifications and click Enable notifications. Permission is requested from that user action. Send test queues a real push for this browser. On iOS/iPadOS, web push requires a supported OS and the app installed to the Home Screen.

Notifications cover listing review, enquiries/chat and business updates. The database stores an in-app notification history and a durable delivery queue. Delivery retries are bounded, stale endpoints are removed, and Expo delivery receipts are checked. User logout unregisters the current client. Push is best effort and depends on device/browser/network settings; an iOS development-build diagnostic test was delivered through the real Expo/Apple services and confirmed received by the owner on 16 November 2026. Android and browser delivery still need device acceptance testing.

## Native push

Remote push is implemented through Expo Notifications and the Expo Push Service. It requires **your own signed development/production build**, not Expo Go. The app keeps Expo Go usable and explains this limit instead of requesting unsupported remote-push registration.

The local app is linked to `@ryanthomas3110/autocars` through the public owner/project ID in `config/expo.json`. `EXPO_OWNER` and `EXPO_PROJECT_ID` override these defaults for another white-label deployment. These identifiers are not signing credentials.

Configure your own:

- Expo owner/project ID (`EXPO_OWNER`, `EXPO_PROJECT_ID`) and production API URL in the EAS environment.
- Android `google-services.json` client configuration via the EAS file variable `GOOGLE_SERVICES_JSON`; upload the separate private FCM v1 service-account credential through EAS credentials.
- iOS APNs credentials through your Apple developer account/EAS credentials.
- Server-only `EXPO_ACCESS_TOKEN` if enhanced Expo Push Service security is enabled.

Build with the development EAS profile and install it on your phones, then enable notifications in Account. Native permissions are opt-in; notifications are not registered automatically on login. The foreground handler, Android marketplace channel, monochrome notification icon and tap routing are configured. No APNs/FCM merchant/developer credentials have been fabricated or submitted here.

## Notification destinations and home navigation

Notification taps now carry destinations: enquiry/chat alerts open `/chat/:leadId`, listing reviews open the specific `/cars/:listingId`, business updates open the business section, and payment alerts open the listing or payment status. Native apps defer authenticated destinations until session restoration/sign-in, handle taps while running and the last tap on a cold start, and ignore duplicate/malformed destinations. In-app notification history uses the same destinations. Staff-only business review and payment administration open the web workspace because those tools are not native screens. The PWA has an authenticated chat route and preserves the destination through sign-in.

The native header logo returns to Explore, clears search filters and returns the list to the top. These JavaScript changes can be loaded through Metro in existing development builds. Test with a newly generated notification: previously delivered notifications retain their old generic `/account` payload.

## Android Firebase setup

The Android registration error about the Firebase messaging service is consistent with a build missing its Firebase client configuration. The locally resolved AutoCars configuration currently has no `googleServicesFile`. The existing downloaded client file belongs to another package and must not be used for AutoCars.

1. In Firebase Console, create/select the intended Firebase project and add an Android app with package **`za.co.autocars.app`** (or your replacement package in `config/brand.json`).
2. Download that app's **`google-services.json`** and save it at **`apps/mobile/google-services.json`**. The config detects this local file automatically; it is ignored by Git.
3. In the AutoCars Expo project's Environment variables, create a **file** variable named **`GOOGLE_SERVICES_JSON`**, uploading that client file for the **development** environment. Also configure it for preview/production when building those profiles. Local ignored files are not automatically included in cloud builds.
4. Configure the **FCM V1 service account key** for the same Firebase project in Expo → Project settings → Credentials → Android → `za.co.autocars.app` → FCM V1 service account key. This is a different JSON file from the client configuration; never bundle the service-account private key in the mobile app. Alternatively run `npx eas-cli@latest credentials --platform android` from `apps/mobile` and choose the Google Service Account / FCM V1 options.
5. From `apps/mobile`, rebuild and install the resulting Android app:

   ```sh
   npx eas-cli@latest build --profile development --platform android --clear-cache
   ```

6. Open Account → Notifications → Enable push notifications, allow permission, then Send test notification. Reloading Metro alone cannot add native Firebase configuration to an installed APK.

Android cloud builds now fail with an explicit configuration message if the client file is missing or belongs to a different package. iOS does not require this Android file. The native registration screen also explains this setup when Firebase token registration fails.

See [Expo's FCM setup guide](https://docs.expo.dev/push-notifications/fcm-credentials/) for the Firebase client and sender credential setup.

## R500 private advertisements: real hosted web checkout

The R500 / 30-day price is retained in `config/brand.json`. The simulated card form and payment-success endpoint have been removed. AutoCars does not collect card numbers. Website/PWA customers submit the advertisement to Payfast's hosted checkout.

Configure server-only values from your own merchant account:

```dotenv
PAYFAST_MERCHANT_ID=your_merchant_id
PAYFAST_MERCHANT_KEY=your_merchant_key
PAYFAST_PASSPHRASE=your_configured_passphrase
PAYFAST_PUBLIC_ORIGIN=https://your_public_autocars_domain
PAYFAST_SANDBOX=true
```

Payfast must be able to POST to the public HTTPS path `/api/payments/payfast/itn`. Localhost is not reachable by the provider. Sandbox uses Payfast's actual sandbox service, not a local simulator; use the sandbox account's credentials and a public staging origin. Live production checkout requires `PAYFAST_SANDBOX=false`.

The server fixes the amount, stores the draft before redirecting, signs checkout parameters, validates the notification signature/merchant/amount/source, confirms it directly with Payfast, and applies verified payments idempotently. Returning to `/payment` does not mark an order paid. A verified new advertisement enters review; its thirty days start at first approval. Verified renewal extends an existing advertisement. Paid orders that cannot be fulfilled are retained with an error and shown to staff under Advertisement payments for resolution/refund through the merchant dashboard.

No real payment was taken or provider account connected during implementation. Credentials, sandbox/live callback acceptance, reconciliation, refunds, VAT/invoice wording and a live merchant acceptance test remain owner setup tasks. The old simulated records are preserved as legacy database history and cannot authorise new advertisements.

## Native paid-listing release blocker

The native app no longer collects card numbers or simulates paid ads. Native advertisement purchases/renewals are deliberately blocked pending a native store-billing implementation. Admin and activated-business native listing workflows, browsing, enquiries, existing listing management and push remain available.

This is a remaining software/release task, not merely an environment variable: paid ad space displayed within the app can require Apple/Google billing. Payfast web checkout must not be presented as a completed native-store billing solution. Configure/implement the appropriate store products, receipt validation, fulfilment and review requirements before publishing paid native listing purchases. This project is not being represented as store-release complete.

## Commands and verification

The agent did not start or stop your existing servers. Restart them yourself to pick up the new code/environment:

```sh
# Existing API/web terminal: Ctrl+C, then
npm run dev

# Existing Expo terminal: Ctrl+C, then
npm run mobile -- --clear
```

Run `npm run check` for TypeScript, in-process HTTP/WebSocket tests, payment and push tests, web/PWA build, service-worker verification, SDK compatibility, both native bundle exports and audit. Test transports/providers are injected only in the test suite; no production endpoint declares a payment successful from a supplied card number.

Primary references: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Chrome installation criteria](https://developer.chrome.com/blog/update-install-criteria), [Payfast documentation](https://developers.payfast.co.za/docs), [Apple payment guidelines](https://developer.apple.com/app-store/review/guidelines/#payments).

## Chat and browser follow-up — 17 November 2026

Chats open at the latest loaded message and follow new messages while near the bottom. Reading older messages preserves the scroll position; sending or focusing the composer returns to the latest message. Native chat uses a full-screen keyboard-avoiding layout with a tappable Send button while the keyboard is visible. Browser chat sizes to the visual viewport. The API returns the latest 500 messages rather than the first 500.

The web header and mobile PWA navigation now show an Inbox icon with a live unread count. The Inbox combines buyer/seller conversations; staff can see the conversations they are authorised to administer. Opening a chat records its latest incoming message/enquiry as read and updates the badge. Staff who have posted in a conversation also receive reply notifications.

Browser Enable requests notification permission directly from the user action, before networking (required for Safari's user-gesture handling), and reports a worker readiness timeout instead of waiting indefinitely. Already opted-in subscriptions can reconnect when the Account panel opens without prompting again. Re-registering the same device/account preserves pending delivery jobs. Changing the device's account still discards the old account's jobs.

The local API reports web push enabled, but the inspected database has no browser subscriptions. A browser must still opt in through Account → Notifications → Enable, and then Send test. On desktop use localhost or HTTPS; on iPhone use an HTTPS installed Home Screen PWA. Native registrations do not register a browser. Real browser delivery remains unconfirmed until a browser is registered and the owner receives its test.

## Enquiry opening message and vehicle subject

The original enquiry is now the first message for both existing and new conversations, using its original sender and timestamp. It is derived from the enquiry record once per response rather than inserted again on each view. Only the receiving seller gets the enquiry-submission push; the sender and unrelated staff do not. Reply notifications still reach the other conversation participants, including staff who joined the chat.

The chat subject is the vehicle year/make/model/variant and is a link to that listing on native and web. iOS waits for the chat modal to dismiss before presenting the listing. An unavailable vehicle shows an error without losing the conversation. Long threads retain the original enquiry plus the latest 500 replies, with an explicit truncated-history notice.
