# Build stage: full dependency tree, compiles TypeScript to dist/.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage: runtime dependencies and the compiled output only.
FROM node:20-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# The node image ships an unprivileged `node` user; nothing here needs root.
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
