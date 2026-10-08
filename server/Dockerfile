FROM node:22-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
USER node
EXPOSE 8080
CMD ["node", "index.js"]
