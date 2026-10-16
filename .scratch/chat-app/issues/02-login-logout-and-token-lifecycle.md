# 02: Вход, выход и жизненный цикл JWT

**What to build:** пользователь возвращается в приложение по email и паролю, сохраняет вход в браузере, выходит во всех вкладках текущего входа и теряет доступ после истечения JWT. Независимый вход другого браузера сохраняется.

**Blocked by:** 01 — Локальный запуск и регистрация.

**Status:** ready-for-human

**Spec:** [Согласованная спецификация](../spec.md).

**User stories:** 5–12; 60–61 в части авторизации.

- [x] Форма входа принимает email и пароль, использует общий типизированный HTTP-клиент и показывает загрузку и понятные ошибки неверных данных. После входа открывается приватная область; перезагрузка и закрытие браузера сохраняют вход до истечения JWT.
- [x] Guards проверяют подпись и срок JWT без обращения к хранилищу сессий. Приватные HTTP-операции не допускают запросы без действительного JWT; регистрация и вход явно публичные.
- [x] Аутентификация использует `@nestjs/passport`: `passport-local` для входа по email и паролю, `passport-jwt` для проверки JWT из HttpOnly cookie и guards на основе `AuthGuard`. JWT выпускается через `@nestjs/jwt`. Уже реализованная JWT-защита приведена к этому подходу с сохранением проверки истечения с управляемым временем.
- [x] Собственный код ограничен регистрацией и поиском пользователя, вызовом библиотеки хеширования и проверки пароля, настройкой cookie, интеграцией проверки с Socket.io и управлением сроком соединений; библиотечные механизмы аутентификации не дублируются. Проверки участия в диалоге остаются в прикладных сервисах.
- [x] JWT хранится в HttpOnly cookie и действует 24 часа без автоматического продления. Новая авторизация не требует серверной Session; ранее выданный JWT не отзывается при выходе.
- [x] В браузере создаётся одно Socket.io-соединение на вкладку после восстановления авторизации. Handshake проверяет JWT; входящие обработчики, если они есть, также защищены.
- [x] Выход очищает cookie, авторизацию и предметные stores всех вкладок текущего браузера, отключает соединения текущего входа и показывает вход. Независимый вход того же пользователя в другом браузере продолжает работать.
- [x] Скопированный JWT после выхода остаётся действительным до срока истечения, включая новое Socket.io-подключение; это ограничение явно описано в README. Отключение текущих соединений не выдаётся за отзыв токена.
- [x] Истечение JWT прекращает доступ HTTP и уже существующего Socket.io-соединения, а не только запрещает новое подключение. Клиент прекращает приватные действия и показывает вход.
- [x] Авторизацией и жизненным циклом соединения владеет app. Shared сообщает об ошибке авторизации через интерфейс клиента без импорта auth-store; stores и соединения не разделяются между пользователями на сервере.
- [x] Контракты, OpenAPI и сгенерированные типы обновлены. Jest-проверки через HTTP и Socket.io покрывают успешный/неуспешный вход, handshake, выход, независимость другого входа, действительность копии JWT после выхода и истечение с управляемым временем.
- [ ] Вручную проверены восстановление входа, приватный маршрут, очистка состояния нескольких вкладок и сохранение независимого входа в другом браузере.


## Comments

### 2026-10-15 — implementation and automated verification

- Implemented login form, app-owned authentication/socket lifecycle, tab logout synchronization, globally protected private HTTP operations with explicit public registration/login, unique login JWT identity, logout cookie clearing, current-login socket disconnection and controlled deadline expiry.
- Socket.io handshake reuses the Passport JWT strategy; no Session collection, denylist or token revocation. Copied JWT HTTP/socket access after logout is tested and documented in README.
- Updated contracts, OpenAPI/generated client and Vite/Compose Socket.io proxies.
- Automated verification: `pnpm check`, `pnpm build`, `DOCKER_HOST=unix:///Users/igor/.docker/run/docker.sock pnpm test` (35 HTTP/Socket.io tests with MongoDB Testcontainers). HTTP logout red initially returned 404; JWT identity regression rejects equal cookies for simultaneous independent logins.
- Manual acceptance is being checked separately by the parent agent; the last checkbox is intentionally open until evidence is available.

### 2026-10-15 — review correction

- Addressed expiry without an available Socket.io connection: registration, login and restoration expose the original JWT deadline in a documented `X-Auth-Expires-At` response header. Contracts validate the deadline and app schedules expiry immediately from HTTP; changing authentication clears the previous timer and generation checks ignore stale timers/socket events.
- HTTP regression verifies registration deadline, original login deadline, no renewal on restoration and refusal at the same deadline without opening a socket (36 total boundary tests).
- Parent manual evidence uses the Codex in-app browser: registration, understandable wrong-password error, correct login, reload, closing/reopening a tab, logout of two tabs, and independent login of the same user surviving logout using separate localhost/127.0.0.1 cookie origins. Chrome-specific/full-browser restart checks were not performed because Chrome DevTools had a profile conflict and native Chrome was in active use.

### 2026-10-15 — итог интеграции

- Реализация находится в ветке `codex/auth-lifecycle`. Ревью стандартов — без замечаний; замечание ревью требований об истечении без Socket.io исправлено и повторно проверено.
- В интеграционном checkout прошёл `pnpm check`. Итоговый `docker compose up --build -d` собрал и запустил приложение; через nginx проверены HTTP-срок JWT, WebSocket handshake, отключение при выходе и действительность копии JWT после выхода.
- Код готов; статус `ready-for-human` относится только к оставшемуся пункту полной ручной приёмки в Chrome с отдельным браузером и перезапуском браузера. Этот пункт не отмечен выполненным на основании проверок отдельных cookie-областей во встроенном Chromium.

### 2026-10-16 — согласовано упрощение следующей миграции

- В [новой спецификации](../../ui-state-architecture/spec.md) и [ADR 0009](../../../docs/adr/0009-server-driven-client-auth.md) согласован отказ от клиентского таймера JWT и отдельной localStorage-рассылки logout. UI реагирует на ответы/события сервера; отключённые вкладки могут узнать о завершении входа при следующем обращении к серверу.
- Это изменение целевых требований, а не выполненная реализация. Прежние проверки выше описывают текущее поведение; серверная проверка JWT и отключение истёкших сокетов сохраняются.
