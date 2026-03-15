FROM node:22-slim AS base

WORKDIR /app

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Build stage
FROM base AS build

COPY package.json pnpm-lock.yaml* ./

RUN corepack enable pnpm && \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# Prune dev dependencies
RUN pnpm prune --prod

# Production stage
FROM base

RUN addgroup --system --gid 1001 mcp && \
    adduser --system --uid 1001 --ingroup mcp mcp

COPY --from=build --chown=mcp:mcp /app/dist /app/dist
COPY --from=build --chown=mcp:mcp /app/assets /app/assets
COPY --from=build --chown=mcp:mcp /app/node_modules /app/node_modules
COPY --from=build --chown=mcp:mcp /app/package.json /app/package.json

USER mcp

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3100
ENV NODE_ENV=production

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:3100/health || exit 1

CMD ["node", "dist/index.js"]
