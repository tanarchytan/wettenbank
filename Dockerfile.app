FROM oven/bun:1 AS base

WORKDIR /app
USER root
RUN apt-get update && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.json next.config.ts tailwind.config.ts ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY app ./app
COPY public ./public
COPY migrations ./migrations
COPY bin ./bin

ENV NEXT_TELEMETRY_DISABLED=1
# Compile Tailwind CSS first (avoids Next 16/Turbopack CSS pipeline issues), then build Next.
RUN bun x tailwindcss -i ./app/globals.css -o ./public/styles.css --minify
RUN bun --bun next build

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "--bun", "next", "start", "-p", "3000"]
