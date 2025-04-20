#########################
# STAGE 1: Build assets #
#########################

FROM node:18.19.1-alpine AS builder

WORKDIR /build

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source files
COPY src/ ./src/

# Transpile TypeScript to JavaScript
RUN npm run build

# Prune dev dependencies
RUN npm ci --only=production

###########################
# STAGE 2: Final image    #
###########################

ARG BUILD_FROM
FROM ${BUILD_FROM:-ghcr.io/hassio-addons/base:14.2.2}

# Metadata
LABEL maintainer="kleimj1 <github.com/kleimj1>"
LABEL org.opencontainers.image.source="https://github.com/kleimj1/hm2mqtt"

# Install Node.js runtime
RUN apk add --no-cache nodejs

# Set working directory
WORKDIR /app

# Copy production dependencies and dist files
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY package.json ./

# Add Home Assistant startup script
COPY ha_addon/run.sh /run.sh
RUN chmod +x /run.sh

# Define default command
CMD [ "/run.sh" ]
