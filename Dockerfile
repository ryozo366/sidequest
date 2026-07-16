FROM node:22-alpine

WORKDIR /app
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    SIDEQUEST_DATA_DIR=/data

# Quests are stored as JSON in /data — mount a volume there to keep them
# across restarts: docker run -v sidequest-data:/data ...
RUN mkdir -p /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/api/quests > /dev/null || exit 1

CMD ["node", "server.js"]
