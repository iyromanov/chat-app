# Чат

Реализованы регистрация, вход, восстановление авторизации и выход во всех вкладках текущего браузера. Интерфейс на английском. Доступны поиск собеседников, личные диалоги и сохранённая текстовая переписка с доставкой во все вкладки участников.

## Минимальный запуск

Нужны Docker Engine/Desktop с работающим Linux runtime и Docker Compose v2 (рекомендуется 4 ГБ памяти). Node.js на хосте для Compose не нужен.

```sh
cp .env.example .env
docker compose up --build -d
```

Откройте http://localhost:8080. Swagger UI: http://localhost:8080/api/docs. Web и API доступны с одного адреса; MongoDB наружу не публикуется.

`docker compose restart` и `docker compose down` сохраняют пользователей в volume `mongo-data`. `docker compose down -v` удаляет данные. Первый запуск скачивает образы и зависимости. Проверка запуска: `docker compose ps`, логи: `docker compose logs api web proxy`.

## Окружение

Пример — `.env.example`. Для Compose обязателен `JWT_SECRET` длиной минимум 32 символа; пример предназначен только для локальной разработки. API проверяет конфигурацию до запуска:

| Параметр        | Назначение                                                   |
| --------------- | ------------------------------------------------------------ |
| `MONGODB_URI`   | Обязательный адрес MongoDB; Compose задаёт его автоматически |
| `JWT_SECRET`    | Обязательный секрет подписи JWT, минимум 32 символа          |
| `PORT`          | Порт API, по умолчанию 3001                                  |
| `COOKIE_SECURE` | `false` для локального HTTP, `true` для HTTPS                |

JWT выдаётся на 24 часа в постоянной HttpOnly cookie с SameSite=Lax, без продления и серверного отзыва. Пароль хешируется scrypt со случайной солью. Email и username уникальны без учёта регистра; отображаемый username сохраняет регистр.

## Разработка и проверки

Нужны Node.js 24 и pnpm 10.33.4 (`corepack enable`), а для MongoDB и HTTP-тестов — работающий Docker. Все команды ниже выполняются из корня.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
docker run --rm -d --name chat-dev-mongo -p 27017:27017 mongo:8
pnpm dev
```

Откройте http://localhost:5173. Vite проксирует `/api` на localhost:3001; `API_PROXY_TARGET` позволяет заменить адрес API. `.env` читает API, web не получает JWT secret. Остановить MongoDB: `docker stop chat-dev-mongo` (этот временный контейнер используется только для разработки; постоянные данные обеспечивает Compose).

```sh
pnpm generate       # экспорт OpenAPI без MongoDB и генерация HTTP-клиента
pnpm check          # TS, Svelte, ESLint/FSD, форматирование, актуальность генерации
pnpm test           # Jest HTTP-тесты с настоящей MongoDB через Testcontainers
pnpm build          # сборка обоих приложений
```

Testcontainers автоматически создаёт и удаляет отдельную MongoDB. Docker должен быть доступен текущему пользователю; на Docker Desktop при ошибке обнаружения runtime можно указать `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock`. Тесты проверяют регистрацию, публичный ответ, cookie, валидацию, уникальность (в том числе конкурентную), восстановление пользователя, отказ без токена и истечение JWT с заменяемым временем.

Ручная проверка: открыть приложение без cookie; увидеть проверку авторизации и форму; отправить неверные данные, затем корректные; проверить приватную область, обновить страницу, закрыть и открыть браузер; попробовать занятый email/username с другим регистром в независимой сессии. На ширине 375 px проверить поля, ошибки и кнопку. После `docker compose restart` убедиться, что cookie по-прежнему открывает того же пользователя. Приватный endpoint: `GET /api/auth/me`, регистрация: `POST /api/auth/register`.

## Структура

- `apps/api`: NestJS; модули auth/users, схемы Mongoose, единые ошибки и заменяемые часы.
- `apps/web`: SvelteKit; маршруты и авторизация в app, экран в pages, форма в features, HTTP-клиент в shared; готовые UI-компоненты импортируются из `flowbite-svelte`.
- `packages/contracts`: Zod-контракты без зависимости от фреймворков.

`apps/api/openapi.json`, `apps/web/src/shared/api/generated.ts` генерируются командой `pnpm generate`; не редактируйте их вручную. Типы и Fetch-клиент создаёт `swagger-typescript-api`. Прикладной код вызывает методы по `operationId` (например, `api.auth.me()`); маршруты и HTTP-методы задаёт OpenAPI. ESLint проверяет направления импортов FSD и публичные интерфейсы срезов, а также изоляцию contracts. Пользовательское состояние создаётся для экземпляра страницы; сервер не рендерит приватные данные.

Аутентификация API использует `@nestjs/passport`: `passport-local` для `POST /api/auth/login` (email и пароль) и `passport-jwt` для проверки `chat_token` в HttpOnly cookie. JWT выпускается через `@nestjs/jwt`; подпись, issuer, audience и срок проверяются Passport с заменяемыми часами. Хеширование и проверка паролей используют `scrypt-kdf`. Вход возвращает тот же публичный профиль, что регистрация; неверные данные дают 401, невалидное тело — 400.

## Вход, выход и срок JWT

`POST /api/auth/logout` очищает cookie и отключает Socket.io-соединения текущего входа. Все приватные HTTP-операции защищены глобальным Passport guard; регистрация и вход явно публичные. Каждая авторизация получает уникальный `jti`, даже при двух входах одного пользователя в одну секунду. После восстановления авторизации app создаёт одно Socket.io-соединение на вкладку. Handshake использует ту же Passport JWT-стратегию; существующие соединения закрываются при истечении JWT. Vite и Compose проксируют `/socket.io` на API.

Вкладки того же origin получают уведомление о выходе через localStorage и очищают состояние. Независимый вход другого браузера остаётся активным. **Выход не отзывает JWT**: скопированный токен продолжает давать HTTP-доступ и позволяет новое Socket.io-подключение до истечения 24 часов. Комнаты Socket.io отслеживают только текущие соединения и не являются серверными сессиями или списком отозванных токенов.

Jest проверяет HTTP-вход и ошибки, persistent cookie, приватный доступ, подпись/claims, handshake, отключение двух вкладок текущего входа, независимый одновременный вход, повторное использование копии JWT и истечение HTTP/существующего Socket.io-соединения с управляемым временем и реальной MongoDB. Ручная проверка: войти, обновить страницу, открыть вторую вкладку; войти тем же пользователем в независимом профиле браузера; выйти из первой вкладки и убедиться, что обе вкладки показывают вход, а независимый профиль остаётся в приватной области. Закрыть и снова открыть браузер, проверить сохранение входа до срока cookie.

Successful registration, login and restoration responses include the documented `X-Auth-Expires-At` header with the original JWT deadline. The app schedules local expiry immediately from this HTTP response, independently of Socket.io availability, and clears the previous deadline when authentication changes. Restoring authentication does not extend the token lifetime.

### Find users and start a conversation

1. Register two users in independent browser sessions (for example Chrome and an incognito window). Keep an additional tab open for each participant, and optionally a third user in another session.
2. Search by part of the other user's username, mixing uppercase and lowercase. Clear the search to list everyone else; search for an unknown name to see “No users found”. Other users' email addresses are never shown.
3. Click “Start conversation”. Both participants' tabs immediately show the same conversation with the other username and “No messages”. Click again, or start from the other participant, to reopen the same conversation. The third user receives nothing.
4. Reload or sign out and in: the empty conversation persists. Below 768 CSS pixels, chats, user search and the selected conversation occupy separate full-screen views. Back returns to the originating list or search with its position and query preserved.
5. With more than 50 other users or conversations, scroll down to load the next page automatically. “Load more” also supports keyboard activation. Change the search during loading and confirm only results for the latest search remain.

HTTP/Socket.io integration coverage runs against Testcontainers MongoDB via `pnpm test`; it covers search, 50-item pages, invalid and query-bound cursors, tied conversation timestamps, repeated/concurrent starts, participant lists, and event delivery to all participant tabs. Browser acceptance remains a separate manual check.

### Send messages and read saved history

1. Open a conversation in two independent sessions, with an extra tab for each participant. Send text with internal line breaks; all participant tabs receive the same saved message without reloading. A third user cannot read or send into this conversation.
2. The composer rejects whitespace-only text and more than 2000 characters after trimming. Submit the boundary of 2000 characters, and check clear validation errors. Sending is confirmed by a saved API response, event or history synchronization. An unconfirmed send exposes “Retry original message”; the original attempt ID and normalized text stay unchanged even if you edit the draft. The edited draft can be sent as a new message after the original attempt is resolved.
3. Send more than 50 messages. Reload and open the conversation: the latest 50 appear oldest first. Click “Load more” to add older messages, checking the boundary for omissions and duplicates. Sign out and back in to verify persistence.
4. Send into an older conversation. Its preview and timestamp update, and it moves to the top in both participants' tabs. Reopening a conversation preserves its last-message preview. Check at 375 px that long words, line breaks, errors and controls remain usable.

`POST /api/conversations/{conversationId}/messages` accepts `text` and `attemptId`. The unique conversation/sender/attempt index protects concurrent retries; a retry with different normalized text returns `409 MESSAGE_ATTEMPT_CONFLICT`. `GET` on the same route returns 50 messages with a scoped `nextCursor` for older history. The `message:created` Socket.io event carries the same public message as HTTP, after saving. Stores merge by message ID; app links message events to the independent message and conversation stores. Latest conversation activity is derived from an indexed Message lookup, without storing a message copy in Conversation or using a multi-document transaction.

The message HTTP/Socket.io tests cover trimming, line breaks, length boundaries, persistence after login, participant access, unique concurrent attempts, text conflicts, tied timestamp pagination and cursor scope, activity ordering, and delivery to every participant tab while excluding outsiders. Recovery tests also cover 105 missed messages across three forward pages, authenticated reconnect and safe retry. Browser acceptance is tracked separately in the tickets.

### Chat layout and navigation

The authenticated interface fills the viewport. At 768 CSS pixels and above, a permanent 320 px sidebar sits beside the conversation; smaller viewports show one screen at a time. Chat lists, search results and messages scroll independently. Avatars are circles containing the first two Unicode code points of the username, preserving its case (one character for a one-character username).

Focus the desktop search to browse users, including with an empty query; Escape or Close search returns to chats. On mobile, use the search icon, Back and the compact menu for Sign out. Opening a conversation from search preserves the query and results for the return journey.

Enter sends a message; Shift+Enter inserts a newline. Drafts and retry attempt IDs stay with their conversation while switching views, until a page reload or sign out. Opening a conversation shows the latest messages; incoming messages follow the bottom only when already there. While reading older messages, use New messages to return to the bottom. Loading older history preserves the visible position. The composer resizes with the visual viewport and grows up to a bounded height.

The first redesign is light-only and uses the existing blue palette. Stories remain a separate planned feature; their visual requirements are recorded in [.scratch/chat-ui-redesign/spec.md](.scratch/chat-ui-redesign/spec.md).

### Connection recovery and safe retry

The sidebar and conversation header show “Connecting…”, “Connected” or “Disconnected — reconnecting…”. Each authenticated tab owns one Socket.io connection. Initial loading, authenticated reconnection and returning to a visible tab refresh conversations and open history through REST. A disconnected socket does not enqueue new sends: a user-triggered HTTP send either confirms saving or remains unconfirmed until explicitly retried or found by an event/history synchronization.

`GET /api/conversations/{conversationId}/messages?after={messageId}` returns newer messages in ascending `(createdAt, id)` order, 50 at a time. Continue with the same `after` plus `nextCursor` until it is null. `after=start` starts recovery from an initially empty history. Forward cursors are bound to the viewer, conversation and anchor, and cannot be used for older history. The client reconciles descending history pages from the latest messages through its oldest previously REST-loaded message; it reads every page if the earlier REST history was empty. Initial opening still loads only the latest 50. This refreshes the loaded region and its older-history cursor, including delayed inserts whose timestamp/ID sorts behind a newer message already seen by the client. Messages older than that region remain reachable with “Load older messages”. Live events merge by ID and never change the REST boundary. REST responses and live events merge by server ID; conversation refresh revisits previously loaded entries so changed activity updates their position and preview without requiring a frozen list snapshot.

MongoDB remains the source of truth. A server failure between saving a message and broadcasting its event can delay display until the next initial load, reconnection or return to the tab. There is no durable event queue or transactional outbox, and no promise of immediate delivery after such a failure. Retry keeps the same saved message rather than creating another one.

Manual scenarios:

1. Open both participant sessions and an extra tab. Disconnect the recipient network, send more than 100 messages from the sender, reconnect and check every missed message, the latest conversation preview and the connection indicator. Return to a background tab and check the same synchronization.
2. Block Socket.io or disconnect the network before sending. Check that no automatic send queue starts. With an unconfirmed send, edit the draft and choose “Retry original message”: only the original text is retried, and the edited draft remains available afterward.
3. Drop the HTTP send response after the server accepts it (for example with a debugging proxy); also block the corresponding event if you need to inspect the unconfirmed state. Retry and verify one saved message. Restore events or return to the tab and check that the saved message confirms the original attempt.
4. Delay the initial messages/conversations request, send from another session while it is pending, then release it. Repeat during reconnect recovery and at a 50-item boundary. Check no omission, duplicate row or stale last-message preview. While scrolling more than 50 conversations, activate a previously loaded older conversation and verify its update after synchronization.
5. Sign out from another tab while a recovery response is delayed; release it and confirm that private data stays cleared and no subsequent recovery page starts. Repeat at JWT expiry and after signing in again. Inspect connections to verify at most one per tab and that the previous login never resumes.

`pnpm test` combines real MongoDB Testcontainers HTTP/Socket.io tests with client runtime HTTP/Socket.io fixtures for load/event races, multi-page recovery, late commits behind the newest message, immutable retry payloads, late response isolation, logout and expiry. Fixtures do not replace the database persistence and uniqueness checks or the manual browser scenarios above.
