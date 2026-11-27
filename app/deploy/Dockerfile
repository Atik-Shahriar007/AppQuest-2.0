# NutriScan API. Build the bundle first: pnpm build:server
FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production PORT=3000
COPY dist/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "node migrate.mjs && node server.mjs"]
