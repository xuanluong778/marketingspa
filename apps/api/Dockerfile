FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NODE_ENV=development

FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate --schema=packages/database/prisma/schema.prisma
RUN pnpm --filter @marketingspa/shared build
RUN pnpm --filter @marketingspa/database build
RUN pnpm --filter @marketingspa/api build
RUN pnpm deploy --filter @marketingspa/api --prod /prod/api

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /prod/api/ ./
EXPOSE 4000
CMD ["node", "dist/main.js"]
