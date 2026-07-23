FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
# some hosts' npm/storage-driver combos install node_modules/.bin without the
# executable bit set, which makes "tsc"/"vite" fail with "Permission denied"
# even though npm ci itself reported success
RUN chmod -R +x node_modules/.bin
COPY frontend/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=frontend-build /app/frontend/dist ./public

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "index.js"]
