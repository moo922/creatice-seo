# Static web client (Vite build) served by nginx, proxying /api to the API service.
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npx turbo run build --filter=@creative-seo/web

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
