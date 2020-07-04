FROM node:12-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

CMD node dist/application/app.js