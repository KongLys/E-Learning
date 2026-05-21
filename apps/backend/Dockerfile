FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --filter api...

COPY apps/api ./apps/api
RUN pnpm --filter api run build
RUN pnpm --filter api run prisma:generate

# ─── Runtime ───────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm

EXPOSE 3001
CMD ["sh", "-c", "node node_modules/.bin/prisma migrate deploy && node dist/main.js"]
