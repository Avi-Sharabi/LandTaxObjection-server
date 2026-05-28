# syntax=docker/dockerfile:1

FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN PUPPETEER_SKIP_DOWNLOAD=1 npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/home/node/.cache/puppeteer

# Chrome system dependencies (Debian Bookworm)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgles2 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libvulkan1 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxss1 \
    unzip \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN PUPPETEER_SKIP_DOWNLOAD=1 npm ci --omit=dev

# Create cache dir owned by node, then install Chrome as that user
RUN mkdir -p /home/node/.cache/puppeteer \
    && chown -R node:node /home/node/.cache
USER node
RUN npx puppeteer browsers install chrome
USER root

COPY --from=builder /app/dist ./dist
RUN chown -R node:node /app/dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
