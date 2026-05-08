# syntax=docker/dockerfile:1.6

# ============ Stage 1: 安装依赖 ============
FROM node:20-alpine AS deps
WORKDIR /app

# 仅复制 manifest，先装 production 依赖以利用缓存
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ============ Stage 2: 运行镜像 ============
FROM node:20-alpine AS runtime

# tini 处理 PID 1 信号；tzdata + 时区设为上海，便于 cron 与日志时间正确
RUN apk add --no-cache tini tzdata wget && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app

# 仅复制运行需要的内容
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public

# 创建非 root 用户，并预创建数据/备份目录
RUN addgroup -S app && adduser -S app -G app && \
    mkdir -p /app/data /app/backups && \
    chown -R app:app /app

USER app

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# 持久化：data（CSV/JSON）+ backups（定时备份产物）
VOLUME ["/app/data", "/app/backups"]

# 健康检查（命中 /api/health）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
