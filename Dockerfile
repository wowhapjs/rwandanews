FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app-data
EXPOSE 3000
CMD ["npm","start"]
