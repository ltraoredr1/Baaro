# --- Étape 1 : compilation du binaire Rust (baaro-media) ---
FROM rust:1-bookworm AS rust-build
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config libavformat-dev && rm -rf /var/lib/apt/lists/*
COPY rust/baaro-media/ ./
RUN cargo build --release --locked

# --- Étape 2 : image d'exécution du worker ---
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=rust-build /build/target/release/baaro-media /usr/local/bin/baaro-media
WORKDIR /app
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN pip install --no-cache-dir -r python/requirements.txt
ENV NODE_ENV=production
ENV BAARO_MEDIA_BIN=/usr/local/bin/baaro-media
ENV BAARO_WORKER_PORT=8787
EXPOSE 8787
ENV PYTHONPATH=/app
CMD ["sh", "-c", "uvicorn python.main:app --host 127.0.0.1 --port 8788 & exec node server.mjs"]
