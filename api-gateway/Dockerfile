# Stage 1 - Builder
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack and pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependency files (better cache layer)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies (including dev for building)
RUN pnpm install --frozen-lockfile

# Source code and build
COPY . .

# Generate Prisma client and build application
RUN pnpm exec prisma generate && pnpm run build

# Stage 2 - Migrator (keeps devDependencies, including prisma CLI)
FROM builder AS migrator

# Stage 3 - Production dependencies (without devDependencies)
FROM builder AS prod-deps
RUN pnpm prune --prod

# Stage 4 - Production
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Node:alpine image already has non-root user "node"
COPY --from=prod-deps --chown=node:node /app/package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/dist ./dist
COPY --from=prod-deps --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 3001

# NestJS start:prod (Node resolves dist/main -> dist/main.js)
CMD ["node", "dist/main"]
