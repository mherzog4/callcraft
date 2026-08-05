FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --chown=1000:1000 --from=builder /app/.next/standalone ./
COPY --chown=1000:1000 --from=builder /app/.next/static ./.next/static
COPY --chown=1000:1000 --from=builder /app/public ./public
COPY --chown=1000:1000 --from=builder /app/drizzle ./drizzle
COPY --chown=1000:1000 --from=builder /app/evals ./evals
COPY --chown=1000:1000 --from=builder /app/scripts ./scripts
COPY --chown=1000:1000 --from=builder /app/src ./src
COPY --chown=1000:1000 --from=builder /app/node_modules ./node_modules
COPY --chown=1000:1000 --from=builder /app/package.json ./package.json
COPY --chown=1000:1000 --from=builder /app/tsconfig.json ./tsconfig.json
COPY --chmod=755 --chown=0:0 --from=builder /app/scripts/container-entrypoint.sh /usr/local/bin/callcraft-entrypoint
RUN mkdir -p /data
# The entrypoint fixes runtime volume ownership, then drops to UID/GID 1000 before application code.
ENTRYPOINT ["/usr/local/bin/callcraft-entrypoint"]
EXPOSE 3000
CMD ["npm", "run", "start:container"]
