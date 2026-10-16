# Чат

Реализованы регистрация, вход, восстановление авторизации и выход с очисткой данных и отключением соединений текущего входа. Интерфейс на английском. Доступны поиск собеседников, личные диалоги и сохранённая текстовая переписка с доставкой во все вкладки участников.

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
- `apps/web`: SvelteKit; маршруты, AuthStore, SessionController и композиция авторизованного контекста в app, экраны в pages, формы в features, HTTP-клиент в shared; готовые UI-компоненты импортируются из `flowbite-svelte`.
- `packages/contracts`: Zod-контракты без зависимости от фреймворков.

`apps/api/openapi.json`, `apps/web/src/shared/api/generated.ts` генерируются командой `pnpm generate`; не редактируйте их вручную. Типы и Fetch-клиент создаёт `swagger-typescript-api`. Прикладной код вызывает методы по `operationId` (например, `api.auth.me()`); маршруты и HTTP-методы задаёт OpenAPI. ESLint проверяет направления импортов FSD и публичные интерфейсы срезов, а также изоляцию contracts. Пользовательское состояние создаётся для экземпляра страницы; сервер не рендерит приватные данные.

Аутентификация API использует `@nestjs/passport`: `passport-local` для `POST /api/auth/login` (email и пароль) и `passport-jwt` для проверки `chat_token` в HttpOnly cookie. JWT выпускается через `@nestjs/jwt`; подпись, issuer, audience и срок проверяются Passport с заменяемыми часами. Хеширование и проверка паролей используют `scrypt-kdf`. Вход возвращает тот же публичный профиль, что регистрация; неверные данные дают 401, невалидное тело — 400.

## Вход, выход и срок JWT

`POST /api/auth/logout` очищает cookie и отключает Socket.io-соединения текущего входа. Все приватные HTTP-операции защищены глобальным Passport guard; регистрация и вход явно публичные. Каждая авторизация получает уникальный `jti`, даже при двух входах одного пользователя в одну секунду. После восстановления авторизации app создаёт одно Socket.io-соединение на вкладку. Handshake использует ту же Passport JWT-стратегию; существующие соединения закрываются при истечении JWT. Vite и Compose проксируют `/socket.io` на API.

SessionController выполняет `/me`, login/register/logout и завершает вход по актуальному HTTP 401 или `auth:ended`. AuthStore хранит только реактивное состояние и синхронные переходы; формы получают actions через props и сохраняют поля, loading и ошибки локально. Начальная ошибка сети/5xx показывает повтор проверки; 401 показывает вход. Login/register используют профиль из своего ответа без дополнительного `/me`. Ошибка серверного logout отображается и сохраняет вход; 401 означает, что вход уже недействителен.

Каждый успешный вход создаёт собственные HTTP-клиент, chat/stores и socket. Перепроверка и reconnect сохраняют этот контекст. Завершение входа и dispose очищают данные, отключают соединение и делают старые операции неактуальными; поздний ответ или 401 прежнего контекста не влияет на новый вход. Повторный запуск корня не добавляет запросы восстановления, соединения или обработчики. При ошибке подключения socket выполняется `/me`; сетевой сбой сохраняет вход.

Подключённые вкладки текущего входа очищают состояние по серверному `auth:ended`. Отдельной localStorage-рассылки и клиентского таймера JWT нет: отключённая вкладка может узнать о завершении входа при следующем запросе/проверке/подключении. Независимый вход другого браузера остаётся активным. **Выход не отзывает JWT**: скопированный токен продолжает давать HTTP-доступ и позволяет новое Socket.io-подключение до истечения 24 часов. Комнаты Socket.io отслеживают только текущие соединения и не являются серверными сессиями или списком отозванных токенов.

Jest проверяет HTTP-вход и ошибки, persistent cookie, приватный доступ, подпись/claims, handshake, отключение двух вкладок текущего входа, независимый одновременный вход, повторное использование копии JWT и истечение HTTP/существующего Socket.io-соединения с управляемым временем и реальной MongoDB. Клиентские HTTP/Socket.io-проверки покрывают композицию авторизации, ошибки и повтор `/me`, login/register без дополнительной проверки, неуспешный logout, устаревшие ответы, изоляцию экземпляров, повторный запуск и dispose. Ручная проверка: войти, обновить страницу, открыть вторую вкладку; войти тем же пользователем в независимом профиле браузера; выйти из первой вкладки и убедиться, что обе подключённые вкладки показывают вход, а независимый профиль остаётся в приватной области. Повторить с отключённой второй вкладкой: после восстановления связи она узнаёт об окончании входа через сервер. Закрыть и снова открыть браузер, проверить сохранение входа до срока cookie.

Successful registration, login and restoration responses still include the documented `X-Auth-Expires-At` header with the original JWT deadline. The client does not use it to schedule expiry. The backend validates JWT lifetime and disconnects expired sockets; restoring authentication does not extend the token lifetime.

### Find users and start a conversation

ChatController performs user search and conversation creation through the existing API. Search query, results, cursor, loading and error belong to each page's local UI model; changing the query or destroying the page invalidates older search responses. Starting a conversation applies its server response to the list and opens history through the same action used for chat selection. A newer selection supersedes a pending start. Removing its search result (including when search closes) cancels that start’s pending history selection and navigation. The page receives data and actions through props; it does not receive an HTTP client or coordinate domain stores. Logout retires the controller, so late search or creation responses cannot enter the next login.

1. Register two users in independent browser sessions (for example Chrome and an incognito window). Keep an additional tab open for each participant, and optionally a third user in another session.
2. Search by part of the other user's username, mixing uppercase and lowercase. Clear the search to list everyone else; search for an unknown name to see “No users found”. Other users' email addresses are never shown.
3. Click “Start conversation”. Both participants' tabs immediately show the same conversation with the other username and “No messages”. Click again, or start from the other participant, to reopen the same conversation. The third user receives nothing.
4. Reload or sign out and in: the empty conversation persists. Below 768 CSS pixels, chats, user search and the selected conversation occupy separate full-screen views. Back returns to the originating list or search with its position and query preserved.
5. With more than 50 other users or conversations, scroll down to load the next page automatically. “Load more” also supports keyboard activation. Change the search during loading and confirm only results for the latest search remain.

HTTP/Socket.io integration coverage runs against Testcontainers MongoDB via `pnpm test`; it covers search, 50-item pages, invalid and query-bound cursors, tied conversation timestamps, repeated/concurrent starts, participant lists, and event delivery to all participant tabs. Client composition checks also cover search pagination and retries, superseded responses, disposed search UI, login isolation, start/open actions, overlapping selections, creation during list refresh and subsequent message exchange. Browser acceptance remains a separate manual check.

### Send messages and read saved history

1. Open a conversation in two independent sessions, with an extra tab for each participant. Send text with internal line breaks; all participant tabs receive the same saved message without reloading. A third user cannot read or send into this conversation.
2. The composer rejects whitespace-only text and more than 2000 characters after trimming. Submit the boundary of 2000 characters, and check clear validation errors. The form disables sending while the POST is pending, clears the submitted text on success, and preserves it with an error on failure. Every new submission is an ordinary new request.
3. Send more than 50 messages. Reload and open the conversation: the latest 50 appear oldest first. Click “Load more” to add older messages, checking the boundary for omissions and duplicates. Sign out and back in to verify persistence.
4. Send into an older conversation. Its preview and timestamp update, and it moves to the top in both participants' tabs. Reopening a conversation preserves its last-message preview. Check at 375 px that long words, line breaks, errors and controls remain usable.

`POST /api/conversations/{conversationId}/messages` accepts only `text`; repeated or concurrent requests can save separate messages with the same text. New documents and public HTTP/WS messages have no `attemptId`. At API startup, the messages module drops the obsolete `conversationId_1_senderId_1_attemptId_1` index if present, preserving existing documents and the history index. Startup fails on unexpected migration errors, preventing sends under the obsolete constraint. Existing messages remain readable; their legacy field is omitted from public history and conversation previews. `GET` on the same route returns 50 messages with a scoped `nextCursor` for older history. The `message:created` Socket.io event carries the same public message as HTTP, after saving. ChatController applies the HTTP response and live events through one operation, updating active history and conversation previews by server Message ID. Unknown conversations trigger a list synchronization through the controller. Latest conversation activity is derived from an indexed Message lookup, without storing a message copy in Conversation or using a multi-document transaction.

The message HTTP/Socket.io tests cover trimming, line breaks, length boundaries, persistence after login, participant access, ordinary concurrent sends, existing-index migration and legacy history, tied timestamp pagination and cursor scope, activity ordering, and delivery to every participant tab while excluding outsiders. Recovery tests also cover 105 missed messages across three history pages, authenticated reconnect and a second saved message on repeated submission. Browser acceptance is tracked separately in the tickets.

### Chat layout and navigation

The authenticated interface fills the viewport. At 768 CSS pixels and above, a permanent 320 px sidebar sits beside the conversation; smaller viewports show one screen at a time. Chat lists, search results and messages scroll independently. Avatars are circles containing the first two Unicode code points of the username, preserving its case (one character for a one-character username).

Focus the desktop search to browse users, including with an empty query; Escape or Close search returns to chats. On mobile, use the search icon, Back and the compact menu for Sign out. Opening a conversation from search preserves the query and results for the return journey.

Enter sends a message; Shift+Enter inserts a newline. Text, sending and error state belong to the mounted conversation form. Switching conversations starts a new form; late results cannot clear its text. Opening a conversation shows the latest messages; incoming messages follow the bottom only when already there. While reading older messages, use New messages to return to the bottom. Loading older history preserves the visible position. The composer resizes with the visual viewport and grows up to a bounded height.

The first redesign is light-only and uses the existing blue palette. Stories remain a separate planned feature; their visual requirements are recorded in [.scratch/chat-ui-redesign/spec.md](.scratch/chat-ui-redesign/spec.md).

### Connection recovery and send errors

The sidebar and conversation header show “Connecting…”, “Connected” or “Disconnected — reconnecting…”. Each authenticated tab owns one Socket.io connection. Initial loading, authenticated reconnection and returning to a visible tab refresh conversations and open history through REST. A disconnected socket does not enqueue new sends: a user-triggered HTTP send either succeeds or shows an error while preserving the text. WS/history can show a saved message even when its HTTP response was lost; they do not turn that failed request into a successful form submission.

`GET /api/conversations/{conversationId}/messages` loads the latest 50 messages, with `cursor=nextCursor` for older pages. Cursors are bound to the viewer and conversation. Reconnection and returning to a visible tab replace the active history with its latest page and the conversation list with its first page, resetting both cursors. Older history remains available with “Load older messages”; other conversations remain available through infinite scroll. There is no automatic traversal of missed pages or restoration of the previously loaded range. Live events received during a request merge by server ID, and stale REST previews cannot replace newer activity. A failed refresh keeps the displayed data and login and offers a retry.

ChatController owns selection actions, HTTP loading, pagination, refresh and HTTP/WS message coordination. Independent Svelte 5 rune stores hold only reactive data and synchronous mutations; components receive readonly data and actions through props. Selection stays local to the page, so an open conversation remains visible even when it falls outside the refreshed list. Search and conversation creation are migrated separately in ticket 04.

MongoDB remains the source of truth. A server failure between saving a message and broadcasting its event can delay display until the next initial load, reconnection or return to the tab. There is no durable event queue or transactional outbox, and no promise of immediate delivery after such a failure. If a POST response is lost after saving, submitting the text again can create a second message. There is no special Retry, automatic resend or deduplication by text/time; only repeated representations of the same server Message ID are merged.

Manual scenarios:

1. Open both participant sessions and an extra tab. Disconnect the recipient network, send more than 100 messages from the sender, reconnect and check only the latest 50 messages, the latest conversation preview and the connection indicator. Use Load older messages to reach the remaining messages. Return to a background tab and check the same synchronization.
2. Block Socket.io or disconnect the network before sending. Check that no automatic send queue starts. Check that a failed send keeps its text and shows an error; submitting again starts a new request.
3. Drop the HTTP send response after the server accepts it (for example with a debugging proxy); allow the corresponding event and check that the saved message appears while the form still shows the HTTP error and preserves its text. Submit again and verify two saved messages.
4. Delay the initial messages/conversations request, send from another session while it is pending, then release it. Repeat during reconnect refresh and at a 50-item boundary. Check that events received during loading survive without duplicate rows or stale previews. Load older history and more than 50 conversations, refresh, and check that old ranges disappear and pagination uses the new cursors. Keep an older conversation open and check that its header and history remain available when it leaves the first list page.
5. With sockets connected, sign out from another tab while a recovery response is delayed; release it and confirm that private data stays cleared and no subsequent recovery page starts. Repeat when the server reports JWT expiry and after signing in again. A disconnected tab learns about logout on its next server interaction. Inspect connections to verify at most one per tab and that the previous login never resumes.

`pnpm test` combines real MongoDB Testcontainers HTTP/Socket.io tests with client runtime HTTP/Socket.io fixtures for load/event races, first-page refresh and cursor resets, pagination after refresh, refresh errors and retries, late commits in the latest page, HTTP/WS send ordering, response loss, unknown conversations, late response isolation, logout and server-driven authorization loss. Fixtures do not replace the database persistence and uniqueness checks or the manual browser scenarios above.
