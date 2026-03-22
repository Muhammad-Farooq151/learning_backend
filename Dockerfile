# # ================================
# # Stage 1: Build Stage
# # ================================
# FROM node:20-alpine AS builder

# WORKDIR /app

# COPY package*.json ./

# RUN npm ci

# COPY . .

# # ================================
# # Stage 2: Production Stage
# # ================================
# FROM node:20-alpine AS production

# RUN apk --no-cache add dumb-init

# RUN addgroup -g 1001 -S nodejs && \
#     adduser -S nodeuser -u 1001

# WORKDIR /app

# COPY package*.json ./

# RUN npm ci --only=production && npm cache clean --force

# COPY --from=builder --chown=nodeuser:nodejs /app .

# USER nodeuser

# EXPOSE 8080

#   # Change start-period from 5s to 30s
# HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:8080/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# CMD ["dumb-init", "node", "server.js"]

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM node:20-alpine AS production

RUN apk --no-cache add dumb-init

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY --from=builder --chown=nodeuser:nodejs /app .

# ✅ CRITICAL FIX: Create uploads directory BEFORE switching to nodeuser
# Container runs as non-root (nodeuser) who can't create directories
RUN mkdir -p /app/uploads && chown -R nodeuser:nodejs /app/uploads

USER nodeuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["dumb-init", "node", "server.js"]
