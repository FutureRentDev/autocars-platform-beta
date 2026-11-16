# API reference

All paths below have `/api` prefix. Requests/responses are JSON except multipart photo uploads and the URL-encoded Payfast notification callback. Errors use `{ "message": "…" }` with appropriate HTTP status. The shared `ApiClient` provides transport and matching TypeScript models.

Web: session cookie and an allowed `Origin` on writes. Native: `Authorization: Bearer <token>`. Native login/signup sends `X-Client: mobile`, which returns a token instead of setting a web cookie. Roles/ownership are always checked server-side.

| Method | Path | Access / purpose |
| --- | --- | --- |
| GET | `/health`, `/config`, `/facets` | Public health, brand/email capability, available makes and inventory total |
| POST | `/auth/register` | name, email, password (12–128 chars), consent=true, optional `accountType` (`customer` or `business`) with `business` details for business accounts; creates an application with status `pending` |
| POST | `/auth/login` | email, password; starts a 30-day session |
| GET | `/auth/me` | Current authenticated user |
| POST | `/auth/logout` | Revoke current session |
| POST | `/auth/forgot` | email; send a recovery link if account exists, requires SMTP |
| POST | `/auth/reset` | token, password; consumes reset token, revokes all sessions |
| POST | `/auth/verify/send` | Authenticated resend; requires SMTP |
| POST | `/auth/verify` | token; consume verification token |
| GET | `/listings` | Published inventory with filters and pagination |
| GET | `/listings/:id` | Public if published; otherwise owner/admin only |
| POST | `/payments/checkout` | Authenticated website/PWA seller; `{listing}` or `{renewId}`. Stores an order for the server-configured fee and returns `{id, action, fields}` for Payfast hosted checkout. Requires merchant configuration; native purchases are blocked pending store billing |
| GET | `/payments/:id` | Owner-only verified order status |
| GET | `/me/payments` | Own advertising payment history |
| POST | `/payments/payfast/itn` | Provider callback; URL-encoded body, verified signature, merchant, amount, source and direct provider confirmation. Idempotent fulfilment |
| GET | `/admin/payments` | Staff payment history including fulfilment errors requiring resolution |
| POST | `/listings` | Admin or activated business seller; validated listing enters review. Private customer listings are created by verified payment fulfilment instead |
| PATCH | `/listings/:id` | Owner; complete listing data, returns to pending; preserves `paidUntil` |
| POST | `/listings/:id/sold` | Owner/admin; removes from public inventory |
| DELETE | `/listings/:id` | Owner/admin; permanently removes listing and its enquiries |
| POST | `/listings/:id/enquire` | Signed-in buyer; name, email, phone, message, consent=true |
| POST | `/uploads` | Authenticated multipart `file`, maximum 8 MB; returns `{url}` |
| DELETE | `/uploads/:id` | Owner, only if not attached to any listing |
| GET | `/me/listings` | Owner inventory, all statuses |
| GET | `/me/favourites` | Saved cars still published |
| POST / DELETE | `/me/favourites/:id` | Save/remove a listing |
| GET / POST | `/me/searches` | Read/create saved search; POST name, filters; max 30 per account |
| DELETE | `/me/searches/:id` | Remove own saved search |
| GET | `/me/leads` | Enquiries on current user's listings |
| PATCH | `/me/leads/:id` | Listing owner; status=new/contacted/closed |
| GET | `/me/export` | Account, listings, submitted enquiries, searches and favourites |
| DELETE | `/me` | Confirm password; removes own non-admin account |
| GET | `/admin/overview` | Admin counts |
| GET | `/admin/listings` | Admin inventory, latest 1,000 |
| PATCH | `/admin/listings/:id` | Admin moderation: status, featured, reason; rejection requires reason |
| GET / PATCH | `/admin/leads`, `/admin/leads/:id` | Admin reads all enquiries (latest 1,000), updates pipeline status with an audit entry |
| GET | `/me/business` | Own business application (business accounts) |
| POST | `/me/business` | Business accounts only; submit or update a pending/rejected application. Fields: businessName, registrationNumber, contactName, phone, province, city, website, message, contactConsent=true |
| GET | `/admin/businesses` | Admin list of business applications, latest 1,000 |
| PATCH | `/admin/businesses/:id` | Admin review: status=contacted/active/rejected/suspended, note (5–1500 chars), agreementReference, termsConfirmed. `active` requires a non-empty agreementReference and termsConfirmed=true; any non-active status returns the seller's published listings to pending review |
| GET | `/admin/users` | Admin user directory, latest 1,000 |
| GET | `/admin/audit` | Admin audit, latest 200 |

Listing fields: make, model, variant, year, price (whole rand), mileage (whole km), bodyType, fuel, transmission, province, city, description (30–6000 chars), images (1–12 own uploaded URLs), sellerName, phone. The API ignores client-supplied ownership, status, role and featured fields when creating/editing listings. Arbitrary remote photo URLs are not accepted.

Public inventory filters: `q`, `make`, `bodyType`, `province`, `fuel`, `transmission`, `minPrice`, `maxPrice`, `minYear`, `maxMileage`, `greatValue=true`, `sort`, `page`. Sort is one of newest, price-asc, price-desc, mileage, year. Response: `{items,total,page,pages}`, 18 cars per page. Listings whose `paidUntil` has passed are excluded from the public catalogue and detail endpoint until renewed.

In production the server also serves the built PWA, `/robots.txt`, `/sitemap.xml` and vehicle-specific HTML metadata at `/cars/:id`.

## Live updates

`GET /api/live` upgrades to a WebSocket. Web clients authenticate implicitly via the session cookie; native clients send `{"type":"authenticate","token":"<session token>"}` after connecting (max 3 attempts). The server sends `{"type":"ready"}` on connect and `{"type":"changed","topics":[...]}` whenever a relevant write completes. Topics: `catalogue` for published-inventory changes visible to everyone, and `account`, `inventory`, `enquiries`, `garage`, `businesses`, `notifications` (plus `admin` for admins) for changes targeting a specific user. Clients should reload the matching data on receipt; `LiveClient` in `@autocars/core` implements reconnect, heartbeat and message authentication for both apps.

Business accounts cannot upload photos or create/edit listings until an admin activates their application with agreed terms (`canSell` in `@autocars/core` mirrors this rule client-side). Suspending or rejecting an activated business returns its published listings to pending review.

## Advertising fees

Personal (customer) accounts pay `brand.adFee` (R500) for a `brand.adDays` (30) day advertisement through Payfast hosted web checkout. Admin and activated business accounts are exempt (`requiresAdFee` in `@autocars/core`). A verified payment creates a pending listing; its advertising period starts on first approval. Verified renewal extends from the later of now or existing expiry. Expired ads disappear publicly but remain in owner inventory. Browser return URLs never authorise payment. Legacy simulated payment records cannot authorise new advertisements. Native purchases require a store-billing implementation before release; they are currently blocked.

See [payment and push setup](live-push-payments.md) for merchant credentials, callback requirements and outstanding release work.

## Messaging and push notifications

- `GET /api/me/enquiries` — enquiries the signed-in user sent, with vehicle details.
- `GET|POST /api/leads/:id/messages` — chat thread for an enquiry. Only the buyer, listing owner or an admin may read or post; messages notify the other party live over `/api/live` (`enquiries` topic) and via push.
- `GET /api/push/config` — public web-push capability and VAPID public key.
- `POST /api/me/push` — register a web subscription or Expo token for the authenticated user.
- `DELETE /api/me/push/:id` — remove an owned device subscription.
- `GET /api/me/notifications` and `POST /api/me/notifications/read` — private notification history and read state.
- `POST /api/me/push/test` — queue a rate-limited test for the signed-in account.
- `GET /api/admin/push/status` — staff delivery-queue status.
- New enquiries notify the seller and admins; business applications notify admins; business decisions notify the applicant. Native push uses the Expo Push Service; browser push uses VAPID/Web Push. A durable queue retries transient failures and removes stale subscriptions. Delivery is best-effort — delivery is not guaranteed and tokens are never exposed to other users.
