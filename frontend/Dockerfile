# Build context: repository root.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include-workspace-root=false
COPY frontend frontend
# Same-origin API behind Caddy, so no CORS and cookies stay first-party.
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build --workspace frontend

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
