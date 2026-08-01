FROM oven/bun:1-alpine AS builder

WORKDIR /app
COPY package.json bun.lock ./
COPY libraries ./libraries

# Copy the target workspace (product or service)
ARG TARGET_PATH
COPY ${TARGET_PATH} ./${TARGET_PATH}

# Install dependencies only for the target workspace
RUN bun install --frozen-lockfile --production

# Create the generated directory for local storage
RUN mkdir -p /app/generated

FROM oven/bun:1-alpine

WORKDIR /app

# Copy the workspace structure
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libraries ./libraries
COPY --from=builder /app/generated ./generated

# Copy the built target
ARG TARGET_PATH
COPY --from=builder /app/${TARGET_PATH} ./${TARGET_PATH}

# Set the working directory to the target
WORKDIR /app/${TARGET_PATH}

EXPOSE 3000

# Download the generated code bundle before the server starts
CMD ["bun", "run", "../../node_modules/.bin/fit-codegen", "download", "--", "bun", "server.js"]
