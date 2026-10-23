# One image recipe for every back-end service. Build it once per service:
#   docker build --build-arg SERVICE=billing -t estateops/billing Backend
# The container runs services/<SERVICE>/src/main/server.js. `migrate` and `mock-providers` use the
# same image with another command (see docker-compose.yml).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY services ./services
# only production dependencies; the workspace packages are linked by npm
RUN npm ci --omit=dev --workspaces --include-workspace-root

FROM node:22-alpine
ARG SERVICE
ENV NODE_ENV=production SERVICE=${SERVICE}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages ./packages
COPY services ./services
COPY db ./db
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/storage && chown app:app /app/storage
USER app
EXPOSE 8080
CMD ["sh", "-c", "exec node services/${SERVICE}/src/main/server.js"]
