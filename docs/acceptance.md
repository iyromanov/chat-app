# Delivery acceptance record

Date: 2026-10-16 (Europe/Moscow). Application baseline: `74c42da92c3bd1800ace460f53df8872242b9761`; the delivery changes update documentation only. Requirements: [ticket 09](../.scratch/chat-app/issues/09-acceptance-and-delivery.md), the [specification](../.scratch/chat-app/spec.md) and [ADRs](adr), including the superseding client decisions in ADRs 0008–0011.

**Result: partial acceptance.** Chat verification passed as detailed below. Stories tickets 06–08 are unimplemented and block complete delivery. No external GitHub publication has been performed. This record does not close ticket 09.

## Automated verification

| Check                        | Result                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                 | Passed: contracts build, API and test TypeScript, Svelte (zero errors/warnings), ESLint/FSD, contracts isolation, Prettier and generated OpenAPI/client freshness         |
| `pnpm test`                  | Passed: 3 Jest suites, 49 backend tests with real MongoDB Testcontainers; 69 client checks including nested cases                                                         |
| Compose build                | Passed: builds contracts, API and production web through `pnpm build`                                                                                                     |
| Host `pnpm build`            | Passed: contracts, API and production web                                                                                                                                 |
| Source language scan         | No Cyrillic text found in application, contracts, tests, scripts, infrastructure or Dockerfile                                                                            |
| Tracked-file credential scan | No private-key blocks, AWS access-key IDs, GitHub tokens or OpenAI keys matched in the 189 baseline tracked files; only `.env.example` is tracked among environment files |
| Git remote                   | `git remote -v` is empty; publication remains an external delivery step                                                                                                   |

The credential scan is a targeted pattern check of the current tracked tree, not a complete audit of Git history or all possible credentials. The sample JWT secret and integration-test secrets are intentionally public fixtures. `.env` is ignored and excluded from the Docker build context. No real credentials were introduced by these documentation changes.

Backend tests include JWT signature/claims/expiry, existing-socket expiry, case-insensitive and concurrent uniqueness, participant privacy, pagination, persistent messages across API restarts and event delivery to participant tabs. Client runtime tests use HTTP/Socket.io fixtures to cover reconnect, first-page resets, pagination after refresh, stale responses, lost send responses and login isolation. Camera, video storage and cleanup have no implementation or test coverage.

## Clean-source Compose verification

The baseline was exported with `git archive HEAD` into `/tmp/chat-delivery-acceptance`, so host `node_modules`, `.env`, build output and ignored files were absent. `.env.example` was copied to `.env`. A separate `chat-delivery-acceptance` Compose project created a fresh MongoDB volume.

Port 8080 was already occupied by the existing application. A temporary override changed only the proxy host port to 18080 and web `ORIGIN` to `http://localhost:18080`. The committed Dockerfile, Compose service definitions and Nginx routes were used unchanged. This establishes a clean-source/fresh-database launch; image and package caches were available, so an entirely cold network download was not measured.

All four containers started; MongoDB reported healthy. The browser loaded the application, protected HTTP requests and Socket.io through the same localhost address. Swagger UI loaded `/api/docs` and listed all nine implemented operations. There are no stories/video routes to verify.

The production build emitted nonfatal warnings about third-party Zod pure annotations and the initially absent generated SvelteKit tsconfig in a clean build. The build completed successfully; the regular Svelte check reported no warnings.

## Browser verification

Executed through Chrome DevTools in desktop Chromium, reporting `Chrome/155.0.0.0`. Alice and Bob used independent browser contexts, with two tabs each. A further independent context signed in as Alice to check login independence, and a third user checked participant privacy. Narrow layout was emulated at 375 × 812 CSS pixels; this is not a real mobile-device test.

| Scenario                                | Observed result                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous access and registration       | Sign in shown without a cookie; separate Alice/Bob registration forms immediately entered the authenticated chat                                                                                                                      |
| Login and duplicate registration errors | Wrong password displayed “Invalid email or password”; differently cased existing email displayed “Email or username is already taken”                                                                                                 |
| Restored authentication                 | Reloaded tabs restored their user and connected Socket.io; valid cookies continued to work after container restarts                                                                                                                   |
| Search                                  | Mixed-case substring found Bob; missing query returned “No users found”; clearing the query showed “People”                                                                                                                           |
| One conversation per pair               | Starting with Bob created one empty conversation visible in all four participant tabs; repeated creation returned the same ID                                                                                                         |
| Live messaging                          | Both directions worked; Shift+Enter preserved a line break; all participant tabs received matching saved messages and previews                                                                                                        |
| Lost send response                      | A browser fetch wrapper forwarded the POST, then threw after receiving the response. The saved message arrived by Socket.io while the composer showed an error and preserved text. Submitting again created a separate second message |
| Offline send                            | DevTools Offline plus closing the captured WebSocket triggered “Disconnected — reconnecting…”. Sending displayed an error and retained the draft; no automatic resend occurred                                                        |
| Reconnect                               | 55 messages were sent via the sender's real HTTP API while the receiver was disconnected. Reconnection restored “Connected” and exactly the latest 50, from `Reconnect 06` to `Reconnect 55`, preserving the failed draft             |
| Older history                           | “Load older messages” expanded the refreshed history from 50 to 100 rows using the new cursor                                                                                                                                         |
| User infinite scroll                    | 55 synthetic users were seeded directly in the isolated MongoDB (cloning a fixture password hash). The actual UI loaded 50 other users, then 56 on scrolling; fixture insertion does not stand in for registration testing            |
| Conversation infinite scroll            | 55 extra conversations were created through authenticated HTTP. After reload, the actual list loaded 50, then 56 on scrolling                                                                                                         |
| Message boundaries                      | At 375 px, 2001 characters showed “Use at most 2000 characters” and retained text; 2000 characters saved and cleared the composer                                                                                                     |
| Narrow layout                           | Registration errors and the open conversation fit the 375 px viewport with document width 375; composer and Back controls remained available; Back returned to the list and the conversation reopened; screenshot inspected           |
| Participant privacy                     | Third user had an empty conversation list; reading and sending to Alice/Bob's conversation returned 404                                                                                                                               |
| Connected-tab logout                    | Signing Alice out cleared both tabs of that login: Sign in, HTTP 401 and zero private history rows. The independently signed-in Alice context retained HTTP 200 and authenticated UI                                                  |
| Disconnected-tab logout                 | A disconnected Alice tab retained its UI while offline, then returned to Sign in after reconnecting following logout in the other tab                                                                                                 |
| Browser JWT expiry                      | A correctly signed 15-second fixture JWT restored authenticated UI and connected Socket.io, then the server ended authentication at expiry: Sign in, HTTP 401 and no private history rows                                             |

Browser fault injection was confined to the acceptance pages and database. The expiry fixture used the public development signing key and existing Alice ID, with a new login ID and valid issuer/audience. It was installed as a script-set cookie with a longer cookie lifetime, so the observed 401 came from server JWT expiry while the cookie was still present. The production 24-hour token policy was unchanged; HttpOnly issuance is covered by the integration tests. The lost-response experiment simulated an application-visible transport failure after a confirmed commit; it was not a physical TCP proxy test. The offline test explicitly closed the browser WebSocket because a brief offline emulation alone can leave an existing connection alive until its heartbeat timeout.

## Persistence

A restart of all four acceptance containers preserved authenticated HTTP access and saved history. After MongoDB finished starting, inspection found 57 users, 56 conversations and 116 messages; this includes the accepted 2000-character boundary message sent after restart. The isolated project was then stopped with `down` and recreated with `up -d --wait`, retaining its named volume. After the third user's registration, inspection found 58 users, 56 conversations and the same 116 messages. Authenticated browser access and reopening the same conversation ID were checked after recreation.

This evidence covers user, conversation and message persistence. Video files, story metadata and personal view marks do not exist, so their persistence and physical removal cannot be accepted. An HTTP denial is not being used as evidence of physical cleanup.

## Current ticket state

The tracker uses triage labels and has no `done` label. Existing checked criteria and dated comments remain the completion evidence; historical verification must be read with the later ADRs.

| Ticket                             | Current state                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 — Local launch and registration | Implemented; current clean-source Compose and registration checks passed. Current HTTP generation uses `swagger-typescript-api`, superseding the original generator choice                                                              |
| 02 — Login/logout/JWT              | Implemented under ADR 0009; connected-tab logout and independent login checked during this acceptance. Server expiry is covered automatically and with a short-lived browser JWT fixture; full browser shutdown/reopen was not repeated |
| 03 — Find users/start conversation | Implemented; current browser search, empty state, creation, additional tabs and pagination checked. Actions now belong to ChatController                                                                                                |
| 04 — Send/history                  | Implemented under ADR 0008; ordinary POSTs can create separate messages on resubmission. Earlier idempotency wording is historical                                                                                                      |
| 05 — Recovery                      | Implemented under ADR 0008 and the completed client-state ticket 03; reconnect refreshes first pages rather than traversing all missed messages. Old-index migration is excluded                                                        |
| 06 — Record/publish stories        | Unimplemented: no camera UI, multipart API, video storage or expiry enforcement                                                                                                                                                         |
| 07 — Story feed/playback/cleanup   | Unimplemented: no feed, player, deadline handling, orphan cleanup or deletion retry                                                                                                                                                     |
| 08 — Personal story views          | Unimplemented: no StoryView persistence, marking, grouping or cleanup                                                                                                                                                                   |
| 09 — Acceptance/delivery           | Partially performed; remains open because 06–08 and the remaining acceptance items below are incomplete                                                                                                                                 |

## Remaining acceptance and publication

- Implement tickets 06–08 before full delivery acceptance, including private video responses and persistent storage configuration.
- Verify camera with/without microphone, denied access, timer, preview, retake, publication, playback/navigation, personal marks, repeated login and expiry of an open story in Chrome.
- Inspect the test video volume and MongoDB to verify physical deletion of expired files, metadata and marks, cleanup after downtime, retries after deletion failures and orphan files without deleting active uploads.
- Finish the full manual chat checklist, including browser shutdown/reopen, focus/scroll behavior and delayed-response races at pagination boundaries. These cases have varying automated or historical coverage; they are not all claimed as repeated in this run.
- Repeat whole-scope review and checks after stories implementation; update this record and ticket 09 only from observed evidence.
- Create/configure the actual GitHub remote and push the reviewed source and documentation. Update the README with the real repository URL. There is no configured destination to publish to in the current checkout.

The README documents stateless-token reuse, possible event delay until REST synchronization, first-page refresh and duplicate text after lost responses. MinIO, transactional outbox, token revocation and other excluded features are not claimed as implemented. The planned stories feed refresh policy is documented as future behavior.

## Delivery documentation review

The implement workflow requested two independent review axes against baseline `74c42da92c3bd1800ace460f53df8872242b9761`. Both Standards and Spec reviews identified the same README defect: it incorrectly promised that a newer selection superseded pending conversation creation. The wording was corrected to match ADR 0011 and the current controller: completed creation opens its conversation even after an intervening selection. No code change was needed. Review scope is these delivery documentation changes; outstanding whole-application acceptance remains open.
