FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY shared ./shared
COPY services ./services
COPY src ./src
COPY scripts ./scripts
EXPOSE 4000
CMD ["node", "services/gateway/index.js"]
