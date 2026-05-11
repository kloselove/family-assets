# syntax=docker/dockerfile:1.6

# ============ Stage 1: 安装依赖（带完整 Node 工具链） ============
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --ignore-scripts --no-audit --no-fund; \
    else \
      npm install --omit=dev --ignore-scripts --no-audit --no-fund; \
    fi && \
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/* /app/node_modules/.cache

# ============ Stage 2: 极简运行镜像 ============
# 用纯 alpine + 仅拷贝 node 二进制和必须的 .so 文件，省掉 npm、头文件等
FROM alpine:3.19 AS runtime

# tini 处理信号；libstdc++ 是 node 的运行时依赖
RUN apk add --no-cache tini libstdc++ && \
    rm -rf /var/cache/apk/* /tmp/*

# 仅拷贝 node 可执行文件（97MB），不带 npm
COPY --from=deps /usr/local/bin/node /usr/local/bin/node

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app
RUN addgroup -S app && adduser -S app -G app && \
    mkdir -p /app/data /app/backups && \
    chown -R app:app /app

COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app package*.json ./
COPY --chown=app:app server.js ./
COPY --chown=app:app mcp-server.js ./
COPY --chown=app:app lib ./lib
COPY --chown=app:app routes ./routes
COPY --chown=app:app scripts ./scripts
COPY --chown=app:app public ./public

USER app

EXPOSE 3000
VOLUME ["/app/data", "/app/backups"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
