# Builds and serves the single-origin production app (web app + API on one port).
# Requires Node >= 22.5 for the built-in node:sqlite module used by packages/server.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
RUN npm ci --omit=dev -w @emberlink/server
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist

EXPOSE 8080
CMD ["node", "packages/server/dist/server.js"]
