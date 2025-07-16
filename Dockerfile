# Stage 1: Build with Yarn
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source and build
COPY . .

RUN yarn build


# Stage 2: Production runtime
FROM node:22-alpine AS production

WORKDIR /app

# Install net-tools
RUN apk add --no-cache net-tools bash curl

# Copy only production dependencies
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --prod

RUN yarn global add pm2

# Copy built output and env files
COPY --from=builder /app/dist ./dist

# Copy any necessary runtime files (e.g., views, assets if needed)
#COPY .env.production ./
COPY ecosystem.config.js ./


# Expose the API port
EXPOSE 3000

# Start the app
#CMD ["node", "dist/index.js"]
#CMD ["yarn", "pm2-runtime", "ecosystem.config.js"]
CMD ["pm2-runtime", "ecosystem.config.js"]

