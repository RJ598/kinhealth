# Stage 1: Build Vite + PWA client bundle
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Stage 2: Production runtime (Express + static dist)
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY server.ts ./server.ts
COPY firebase-applet-config.json ./firebase-applet-config.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

USER node

CMD ["node", "server.ts"]
