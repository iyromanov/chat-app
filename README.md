# Chat

A local real-time chat application built with NestJS, SvelteKit, TypeScript and MongoDB. Register, find another user, start a private conversation and exchange persistent messages across browser tabs. The interface uses Flowbite Svelte and Tailwind CSS and is in English.

**Delivery status:** the chat is implemented. Video stories (recording, publication, playback, expiry cleanup and personal view tracking) are **not implemented**. Tickets 06–08 remain open, so ticket 09 and the complete agreed scope are not accepted. See the [acceptance record](docs/acceptance.md) for verification results and outstanding work.

## Run locally with Docker Compose

Prerequisites: Docker Engine or Docker Desktop with a running Linux container runtime and Docker Compose v2. Allocate approximately 4 GB of memory. Port 8080 must be free. Node.js is not needed on the host for this mode. The first build needs internet access to download images and npm packages; running the application requires no cloud services.

From the repository root:

```sh
cp .env.example .env
docker compose up --build -d
```

Open [http://localhost:8080](http://localhost:8080). [Swagger UI](http://localhost:8080/api/docs) documents the implemented HTTP API. Nginx routes `/api` and `/socket.io` to the API and everything else to the web server, including WebSocket upgrades. Only the proxy publishes a host port; MongoDB is internal. There are no video endpoints or video storage volumes yet.

```sh
docker compose ps
docker compose logs api web proxy
docker compose restart
docker compose down
```

The named `mongo-data` volume stores users, conversations and messages across `restart`, `down` and a subsequent `up`. Back up this volume before deleting or replacing it. **`docker compose down -v` deletes this project's persistent database.** Removing containers alone does not delete the volume.

A fresh database is the supported delivery baseline. Migration from the earlier implementation with `attemptId` is excluded: the API does not remove its obsolete unique index automatically. An old development volume may reject ordinary sends; use a separate Compose project and fresh volume for evaluation rather than deleting data you need.

## Configuration

Copy [.env.example](.env.example) to `.env`. The checked-in JWT secret is a public local-development example; replace it for any shared deployment. Keep real secrets in the ignored `.env` file.

| Variable           | Required / default                    | Purpose                                                                                           |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`       | Required, at least 32 characters      | JWT signing key; Compose reads it from `.env`                                                     |
| `MONGODB_URI`      | Required for host development         | MongoDB connection URL; Compose sets `mongodb://mongo:27017/chat` automatically                   |
| `PORT`             | API default: `3001`                   | API listening port; Compose fixes it at 3001                                                      |
| `COOKIE_SECURE`    | Default: `false`                      | Use `false` for local HTTP; use `true` with HTTPS; Compose fixes it to `false`                    |
| `API_PROXY_TARGET` | Vite default: `http://localhost:3001` | Optional developer proxy target; export it in the shell when starting Vite                        |
| `ORIGIN`           | Compose: `http://localhost:8080`      | Production web origin; change together with proxy port/address if using a custom Compose override |

The API validates configuration before starting. Changing `.env` does not change an already running container: recreate it with `docker compose up -d`. Rotating `JWT_SECRET` invalidates existing tokens. These Compose defaults are intended for local evaluation over HTTP.

## Developer mode

Prerequisites: Node.js 24, pnpm 10.33.4 (`corepack enable`), and Docker for MongoDB and the integration tests. Run commands from the repository root. Keep ports 5173 and 3001 free. The example below uses host MongoDB port 27018 to avoid a common local port conflict:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
docker run -d --name chat-dev-mongo -p 127.0.0.1:27018:27017 -v chat-dev-mongo-data:/data/db mongo:8
```

Set `MONGODB_URI=mongodb://localhost:27018/chat` in `.env`, then:

```sh
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` and `/socket.io` to the API. The API reads the root `.env`; web does not receive the signing secret. Stop the processes with Ctrl+C, stop MongoDB with `docker stop chat-dev-mongo`, and resume it with `docker start chat-dev-mongo`. The developer database volume is separate from Compose and Testcontainers.

## Generate, check and test

```sh
pnpm generate       # Export OpenAPI without MongoDB; generate HTTP types and Fetch client
pnpm check          # TypeScript, Svelte, ESLint/FSD, Prettier and generated-artifact freshness
pnpm test           # All Jest HTTP/Socket.io integration tests and client runtime tests
pnpm build          # Build contracts, API and production web
```

Do not edit `apps/api/openapi.json` or `apps/web/src/shared/api/generated.ts` manually. Update Zod contracts and API descriptions, then run `pnpm generate` and commit both artifacts. `swagger-typescript-api` creates methods from OpenAPI operation IDs; application code calls the configured shared client, for example `api.auth.me()`.

`pnpm check` also checks FSD import directions and slice public interfaces, and prevents the contracts package from importing application frameworks. Testcontainers creates and removes an isolated real MongoDB container for each backend suite; tests do not use the application database. Docker must be accessible to the current user. On Docker Desktop, if runtime discovery fails, try:

```sh
DOCKER_HOST="unix://$HOME/.docker/run/docker.sock" pnpm test
```

For a targeted backend check after dependencies are built:

```sh
pnpm --filter @chat/api test --runTestsByPath test/messages.spec.ts
pnpm --filter @chat/web test
```

Backend coverage includes validation, case-insensitive and concurrent uniqueness, participant privacy, pagination, HTTP/Socket.io delivery, persistence across API restarts, logout and JWT expiry with controlled time. Client runtime tests exercise HTTP/Socket.io ordering, refresh, failures, stale responses and login isolation. They do not replace browser acceptance or camera testing. No stories tests exist yet.

## Demonstrate with two users

Use two independent browser profiles or one regular and one incognito window. Tabs in one profile share cookies, so they cannot hold two independent users on the same origin. Open an extra tab in each profile to check delivery across tabs.

1. Register Alice and Bob with distinct emails and usernames (3–30 Latin letters, digits or underscores), and passwords of 8–128 characters. Registration signs in immediately. Reload and check that the login persists. Try an existing email/username with different letter case and incorrect login credentials to see errors.
2. Search for part of the other username with mixed case. Clear the query to browse other users; search for an unknown name to see “No users found”. Other users' emails are private. Click “Start conversation”: both participants see one conversation with “No messages”. Starting again from either side opens the same conversation.
3. Send in both directions, including line breaks (Shift+Enter). Enter sends. All participant tabs receive the saved message. Whitespace-only messages cannot be sent; text over 2000 characters after trimming shows an error. A pending request disables the composer. Success clears the submitted text; failure preserves it with an error.
4. Create more than 50 messages. Reload and reopen the conversation: the latest 50 are ordered oldest first. “Load older messages” adds earlier history without duplicate rows. Sending updates the conversation preview and activity order. Sign out and back in to check saved history.
5. With more than 50 other users or conversations, scroll their respective lists to load the next page. “Load more” also works with the keyboard. Change a search while it loads to check that older results do not replace the current query.
6. Disconnect Bob's tab with DevTools Network → Offline, send messages from Alice, then restore the network. Check “Disconnected — reconnecting…” and “Connected”, the current preview and the latest 50 messages. Older missed messages remain available through pagination. Returning to a visible tab performs the same refresh and resets previously loaded ranges.
7. To inspect a lost response, use DevTools request interception or a debugging proxy to forward a message POST to the server but drop its response. Let Socket.io deliver the saved message. The form keeps its text and reports a request error. Submitting again is a new send and may save a second message with the same text. There is no automatic resend queue or special Retry operation.
8. Sign out from one connected tab. Other connected tabs of that login return to Sign in and clear private data; an independent login stays active. A disconnected tab discovers logout on its next server interaction. JWTs expire after 24 hours; real server expiry is verified by controlled-time integration tests rather than a 24-hour manual wait.
9. At 375 CSS pixels, check registration/login errors, search, Back navigation, long messages and sending. Below 768 pixels the list, search and conversation are separate views; desktop shows a sidebar. Older history keeps its scroll position; “New messages” returns to the bottom when reading above it.
10. Run `docker compose restart`, reload and reopen the conversation. Users and history must remain. Repeat with `docker compose down` followed by `docker compose up -d` to check volume persistence.

Use a third independent user to confirm they do not receive participant events and cannot read or send to the conversation. Swagger UI can exercise protected HTTP operations using the current origin's login cookie.

## Architecture and behavior

- `apps/api`: NestJS auth, users, conversations, messages and realtime modules; Mongoose schemas belong to their modules. Controllers and the gateway delegate to application services. Passwords use `scrypt-kdf` with random salts. Email and username uniqueness is protected by case-insensitive normalized unique indexes.
- `apps/web`: SvelteKit with FSD layers and Svelte 5 rune stores. `createApplication` composes `SessionController`, `ChatController`, per-login stores and one Socket.io connection per tab. Stores contain reactive data and synchronous mutations; controllers perform asynchronous work. Components receive readonly state and actions through props. Search and composer state remain local to UI.
- `packages/contracts`: framework-independent Zod schemas for validation, public data and Socket.io events. HTTP types/client are generated from OpenAPI.

Each successful login owns a separate client context. Logout/disposal invalidates its pending chat operations; late responses cannot populate another login. Search results are scoped to the current query. An already started conversation creation can complete after the search closes or changes. When it completes, it opens the created conversation even if the user selected another conversation in the meantime.

Messages are MongoDB's source of truth. Each POST creates an ordinary message; REST responses and live events merge by server Message ID. The last-message preview is derived through an indexed Message lookup, rather than duplicated in Conversation. Reconnection and returning to the tab replace the conversation list with its first page and active history with its latest 50, reset cursors and merge events arriving during loading. Other pages remain available through pagination. Failed background refreshes preserve displayed data and offer “Try again”.

Authentication uses Passport local/JWT strategies, JWT issuer/audience/signature checks, and a persistent HttpOnly `chat_token` cookie with `SameSite=Lax`. Tokens last 24 hours with no refresh. The API checks expiry and disconnects expired sockets. The documented `X-Auth-Expires-At` response header does not renew the token or schedule a client timer.

## Limitations and remaining delivery work

- **Stateless JWT:** logout clears the cookie and disconnects current-login sockets but does not revoke a copied token. That token can still make HTTP requests and open a new Socket.io connection until expiry. There is no server session collection or token denylist. No localStorage logout broadcast or client JWT expiry timer is used.
- **Event delivery:** a crash between saving a message and broadcasting its event can delay display until the next load, reconnect or return to the tab. There is no transactional outbox, durable event queue or guarantee of immediate delivery after such a crash. Lost POST responses can lead to a second saved message on resubmission.
- **Browser support:** evaluation targets desktop Chrome/Chromium and narrow viewports. Other browsers and real mobile devices have not been accepted. Browser verification details are in the acceptance record.
- **Stories:** tickets [06](.scratch/chat-app/issues/06-record-and-publish-story.md), [07](.scratch/chat-app/issues/07-story-feed-playback-and-expiration.md) and [08](.scratch/chat-app/issues/08-personal-story-view-state.md) remain unimplemented. Their agreed behavior is camera recording up to 15 seconds, a 25 MB publication limit, private playback for 24 hours, persistent personal views and physical cleanup. The planned feed refreshes on opening, returning to the tab and own publication; another author's story would appear on the next such refresh. There is no implemented feed, video persistence, cleanup, polling or stories Socket.io notification. MinIO, transcoding and public video hosting are excluded.
- **Publication:** no Git remote is configured for this checkout as of the acceptance record. Create a GitHub repository, configure its real remote and push the reviewed branch before claiming external publication. No repository URL is invented here.

The [specification](.scratch/chat-app/spec.md), [glossary](GLOSSARY.md), [ADRs](docs/adr) and [local tickets](.scratch/chat-app/issues) record scope and decisions. The later client simplifications in ADRs 0008–0011 supersede historical promises of idempotent sends, automatic recovery of every missed page, client JWT timers and old-index migration. Historical ticket comments describe their original verification; the acceptance record describes the current delivery.
