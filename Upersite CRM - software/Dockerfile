# Upersite CRM: immagine di produzione (funziona su qualsiasi macchina con Docker, amd64 e arm64)

# ── 1. Compilazione dell'app ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── 2. Immagine finale: solo il server (usa solo moduli di Node, nessuna dipendenza npm) ──
FROM node:22-alpine
LABEL org.opencontainers.image.title="Upersite CRM" \
      org.opencontainers.image.description="CRM di Upersite Studio: app web e server in un unico container" \
      org.opencontainers.image.source="https://github.com/tombino104/Upersite-CRM"
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    CRM_DATA_DIR=/data
WORKDIR /app

COPY package.json ./
COPY server ./server
# Il server legge l'elenco dei servizi AI dal sorgente dell'app
COPY src/utils/aiProviders.js ./src/utils/aiProviders.js
COPY --from=build /app/dist ./dist

# Dati (crm_data.json, Dati/, chiavi AI) e backup stanno in volumi, mai dentro l'immagine
RUN mkdir -p /data /backups && chown -R node:node /data /backups /app
VOLUME ["/data", "/backups"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
