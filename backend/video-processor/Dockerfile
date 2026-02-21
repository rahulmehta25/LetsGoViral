FROM node:22-slim

# Install FFmpeg and required codecs
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Run as non-root
RUN addgroup --system --gid 1001 clipora \
 && adduser  --system --uid 1001 --ingroup clipora clipora \
 && mkdir -p /tmp/clipora && chown -R clipora:clipora /usr/src/app /tmp/clipora
USER clipora

CMD ["node", "src/run-job.js"]
