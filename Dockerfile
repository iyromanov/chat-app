FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
FROM build AS api
EXPOSE 3001
CMD ["pnpm", "--filter", "@chat/api", "start"]
FROM build AS web
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "@chat/web", "start"]
