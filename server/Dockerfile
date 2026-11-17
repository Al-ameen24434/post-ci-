
FROM node:26-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node .env.example .env.example

USER node

EXPOSE 4000

CMD ["npm", "start"]
