# Build stage
FROM node:20-alpine AS build

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

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 