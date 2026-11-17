FROM node:26-alpine

# Pick up security fixes for packages shipped in the base image
RUN apk upgrade --no-cache

WORKDIR /app

COPY package*.json ./

# npm is only needed at build time; removing it also drops the vulnerable
# undici/brace-expansion copies bundled inside the base image's npm.
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --chown=node:node src ./src
COPY --chown=node:node .env.example .env.example

USER node

EXPOSE 4000

CMD ["node", "src/index.js"]
