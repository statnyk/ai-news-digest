FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ─── Production image ────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY --from=frontend-build /build/dist ./frontend/dist/

RUN mkdir -p /app/outputs

ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE ${PORT:-3001}

CMD ["node", "src/server.js"]
