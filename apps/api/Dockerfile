# Self-hosted API image. Multi-stage: build the monorepo, then ship the
# compiled output + dependencies. Config comes from environment at runtime.
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npx turbo run build --filter=@creative-seo/api...

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
