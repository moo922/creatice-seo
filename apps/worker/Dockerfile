# Self-hosted worker image (BullMQ queues + recurring scheduler + health server).
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npx turbo run build --filter=@creative-seo/worker...

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3100
CMD ["node", "apps/worker/dist/main.js"]
