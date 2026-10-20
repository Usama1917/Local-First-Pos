FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.2.2
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run typecheck && pnpm run build:shop

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-noto-core fontconfig ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    POS_HOSTED=1 \
    POS_DATA_DIR=/data \
    POS_CONFIG_DIR=/data/config \
    POS_ARCHIVE_DIR=/data/archive \
    TZ=Africa/Cairo
# The API bundle includes its JS dependencies and logging workers.
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/pos/dist/public ./artifacts/pos/dist/public
COPY scripts/cloud-backup.mjs ./scripts/cloud-backup.mjs
COPY artifacts/pos/src/fonts /usr/local/share/fonts/pos
RUN fc-cache -f
COPY tests/hosting.test.mjs ./tests/hosting.test.mjs
# Exercise the actual Linux runtime before Railway can deploy this image.
# All test databases are temporary; no volume or production credentials required.
RUN REQUIRE_PDF=1 node --test tests/hosting.test.mjs
EXPOSE 8080
# Railway volumes are root-owned by default. No secrets or shop files in image.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
