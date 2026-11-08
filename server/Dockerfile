FROM node:22-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/index.js ./
COPY server/itinerary.mjs ./

EXPOSE 3000
CMD ["node", "index.js"]
