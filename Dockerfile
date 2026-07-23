# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# python3/make/g++ let `serialport`'s native addon compile from source when no
# prebuilt binary matches this image's platform/arch.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN npm ci

COPY packages ./packages
RUN npm run build
RUN npm prune --omit=dev

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# udev is how `serialport` enumerates devices on Linux at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends udev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build /app/packages/frontend/dist ./packages/frontend/dist

EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:9000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Binds 0.0.0.0 inside the container regardless of the app's own loopback-only
# default -- Docker's own port mapping (-p) is the actual network boundary.
# See the README security section before mapping this to a non-loopback host
# interface without also setting auth.mode.
CMD ["node", "packages/backend/dist/index.js", "start", "--host", "0.0.0.0"]
