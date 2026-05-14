FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

LABEL org.opencontainers.image.source="https://github.com/alexzerabr/casa-granum" \
      org.opencontainers.image.description="Casa Granum — frontend (Next.js 14)" \
      org.opencontainers.image.licenses="proprietary" \
      org.opencontainers.image.title="casa-granum-frontend" \
      org.opencontainers.image.vendor="Casa Granum"

EXPOSE 8080

# alpine não tem curl/wget; usa o próprio node pra checar a raiz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "var p=process.env.PORT||8080;require('http').get('http://localhost:'+p+'/', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
