# --- Étape 1 : compilation du binaire Rust (baaro-media) ---
FROM rust:1-bookworm AS rust-build
WORKDIR /build
COPY rust/baaro-media/ ./
RUN cargo build --release --locked

# --- Étape 2 : image d'exécution du worker ---
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=rust-build /build/target/release/baaro-media /usr/local/bin/baaro-media
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
ENV BAARO_MEDIA_BIN=/usr/local/bin/baaro-media
EXPOSE 8787
CMD ["node", "server.mjs"]
