# syntax=docker/dockerfile:1.7
# One image per back-end service (docs/03 §6): api, indexer or keeper.
#   docker build -f infra/docker/Dockerfile --build-arg SERVICE=api -t mohonaut-api .
# turbo prune keeps only the workspaces the service needs; the result runs as the unprivileged
# `node` user from a read-only root file system (infra/stack/compose.yml).
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS prune
WORKDIR /repo
RUN npm install --global turbo@2.11.7
COPY . .
ARG SERVICE
RUN test -n "${SERVICE}" && turbo prune "@mohonaut/${SERVICE}" --docker

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
# Dependencies first (their layer is cached until a package.json or the lockfile changes).
COPY --from=prune /repo/out/json/ .
RUN npm ci --no-audit --no-fund
COPY --from=prune /repo/out/full/ .
ARG SERVICE
RUN npx turbo run build --filter="@mohonaut/${SERVICE}..." \
  && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=root:root /repo /app
ARG SERVICE
WORKDIR /app/services/${SERVICE}
USER node
# The deployment record and secrets are mounted at run time (infra/stack/compose.yml).
CMD ["node", "dist/main.js"]
