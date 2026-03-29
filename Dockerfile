FROM node:20-alpine AS client-builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=client-builder /build/client/dist ./client/dist
RUN mkdir -p /app/data
EXPOSE 3011
CMD ["node", "server/index.js"]
