#!/usr/bin/env bash
# 一键 Docker 部署脚本：构建镜像 -> 启动 -> 健康检查
# 用法：bash docker-run.sh [start|stop|restart|logs|build|status]

set -e
cd "$(dirname "$0")"

CMD="${1:-start}"

ensure_env() {
    if [ ! -f .env ]; then
        cp .env.example .env
        echo "[init] 已根据 .env.example 生成 .env，请按需修改后再次启动"
        echo "[init] 至少修改：JWT_SECRET、ADMIN_DEFAULT_PASSWORD、WX_APPID/WX_SECRET（可选）"
    fi
    mkdir -p data backups
}

compose() {
    if command -v docker compose >/dev/null 2>&1; then
        docker compose "$@"
    elif command -v docker-compose >/dev/null 2>&1; then
        docker-compose "$@"
    else
        echo "未找到 docker compose / docker-compose，请先安装 Docker"
        exit 1
    fi
}

case "$CMD" in
    build)
        ensure_env
        compose build
        ;;
    start|up)
        ensure_env
        compose up -d --build
        echo "[ok] 已启动，访问: http://localhost:$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d ' \r' || echo 3000)/login.html"
        ;;
    stop|down)
        compose down
        ;;
    restart)
        compose restart
        ;;
    logs)
        compose logs -f --tail=200
        ;;
    status|ps)
        compose ps
        ;;
    *)
        echo "用法: $0 {start|stop|restart|logs|build|status}"
        exit 1
        ;;
esac
