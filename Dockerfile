FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs learning-service.mjs finance-service.mjs checkout-service.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node demo-assets ./demo-assets
COPY --chown=node:node demo-data ./demo-data
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||3000) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-demo.mjs"]
