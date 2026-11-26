# Production image: builds the client and runs the game server on $PORT.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm install --no-save tsx@4
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/engine ./src/engine
COPY src/net/protocol.ts ./src/net/protocol.ts
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
