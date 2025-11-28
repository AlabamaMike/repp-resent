# Dashboard Service Dockerfile
# Multi-stage build for the Next.js dashboard

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Set build-time environment variables
ARG API_URL
ENV API_URL=${API_URL:-http://localhost:3001}

# Build Next.js application in standalone mode
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Expose port (Cloud Run uses 8080 by default)
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
