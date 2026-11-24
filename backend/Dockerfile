# Build context: repository root (npm workspaces share one lockfile).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root=false
COPY backend backend
RUN npm run build --workspace backend

# One-off job image for migrations and seeders (needs sequelize-cli from devDependencies).
FROM build AS migrate
WORKDIR /app/backend
ENV NODE_ENV=production
CMD ["sh", "-c", "npx sequelize-cli db:migrate && npx sequelize-cli db:seed:all && if [ -n \"$ADMIN_EMAIL\" ]; then npm run db:seed:admin-from-env; fi"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root=false --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
RUN mkdir -p storage/uploads && chown -R node:node storage
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/v1/health/live > /dev/null || exit 1
CMD ["node", "dist/server.js"]
