FROM node:26-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node src ./src
COPY --chown=node:node .env.example .env.example

USER node

EXPOSE 4000

CMD ["node", "src/index.js"]
