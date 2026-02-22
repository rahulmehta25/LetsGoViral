FROM node:22-slim

# Install FFmpeg (needed for finalize-clips endpoint)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy dependency manifests first (layer cache optimization)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY src ./src

# Run as non-root for security
RUN addgroup --system --gid 1001 clipora \
 && adduser  --system --uid 1001 --ingroup clipora clipora \
 && chown -R clipora:clipora /usr/src/app
USER clipora

# Cloud Run injects PORT env var; default to 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
