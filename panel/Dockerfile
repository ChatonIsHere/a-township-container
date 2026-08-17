# build context is the repo root, same as the other variant images
FROM node:22-alpine AS build
WORKDIR /app
COPY panel/package.json panel/package-lock.json ./
RUN npm ci
COPY panel/ ./
RUN npm run build

# the server bundle is self contained, no node_modules at runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "dist-server/index.mjs"]
