# Single-stage Docker image — runs the Hono server with tsx (no JS build step).
# tsx imports TypeScript directly, including workspace deps (@focus-quote/shared)
# whose package.json `main` points at ./src/index.ts.
#
# Build context must be the repo root so workspace deps resolve correctly:
#   docker build -f apps/server/Dockerfile -t focus-quote-server .

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install workspace metadata first for better layer caching
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspaces --include-workspace-root --omit=optional && \
    npm cache clean --force

# Copy source (.dockerignore strips node_modules, dist, .env, etc.)
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server

# Drop privileges
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "apps/server"]
