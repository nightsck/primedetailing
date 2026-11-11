# Chat-Server für den eigenen Server (Hetzner). Gebaut wird aus dem Hauptordner des Repos,
# weil die Preise und Stellen von Prime Detailing aus dem Website-Ordner (src/_data) kommen:
#   docker compose -f chatbot/hetzner/docker-compose.yml up -d --build
FROM node:22-slim
WORKDIR /app/chatbot
COPY chatbot/package.json chatbot/package-lock.json ./
RUN npm ci
COPY chatbot/ ./
COPY src/_data /app/src/_data
COPY src/assets /app/src/assets
# Konfiguration, Preise, Seiten und Admin-Oberfläche in den Code einbacken
RUN node scripts/daten-bauen.mjs
RUN mkdir -p /daten && chown node:node /daten
ENV PORT=8787 DATEN_PFAD=/daten/kunden.sqlite NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/node.ts"]
