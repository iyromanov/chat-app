# Чат

Первый реализованный сценарий: регистрация → приватная область → восстановление авторизации после перезагрузки. Интерфейс на английском. Вход и переписка добавляются следующими задачами.

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

`apps/api/openapi.json`, `apps/web/src/shared/api/schema.d.ts` и `apps/web/src/shared/api/operations.ts` генерируются командой `pnpm generate`; не редактируйте их вручную. Прикладной код вызывает методы по `operationId` (например, `api.AuthController_me()`); маршруты и HTTP-методы задаёт OpenAPI. ESLint проверяет направления импортов FSD и публичные интерфейсы срезов, а также изоляцию contracts. Пользовательское состояние создаётся для экземпляра страницы; сервер не рендерит приватные данные.

Аутентификация API использует `@nestjs/passport`: `passport-local` для `POST /api/auth/login` (email и пароль) и `passport-jwt` для проверки `chat_token` в HttpOnly cookie. JWT выпускается через `@nestjs/jwt`; подпись, issuer, audience и срок проверяются Passport с заменяемыми часами. Хеширование и проверка паролей используют `scrypt-kdf`. Вход возвращает тот же публичный профиль, что регистрация; неверные данные дают 401, невалидное тело — 400.
