# Build stage
FROM node:26-alpine AS build

WORKDIR /app

# Empty by default so api.js uses relative /api (proxied by nginx).
# Override at build time if you need an absolute API URL: --build-arg VITE_API_URL=http://localhost:4000
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM nginx:stable-alpine

# Pick up security fixes for packages shipped in the base image (e.g. libxslt)
RUN apk upgrade --no-cache

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /var/run

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 