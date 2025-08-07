# Build a production image for Test Fest Tracker
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /usr/src/app

# Install deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy app
COPY . .

# Create uploads dir (mounted volume in ECS if desired)
RUN mkdir -p /usr/src/app/uploads

EXPOSE 3000

# Simple healthcheck (expects server to expose /health)
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]


