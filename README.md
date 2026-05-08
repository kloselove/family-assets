# 家庭资产管理系统

家庭物品 / 证件 / 票据的录入、查询、过期提醒，一站式管理。

- **服务端**：Node.js + Express，数据存储为 CSV + JSON 文件，方便定期同步到云端
- **Web 前端**：纯静态页面，访问 `http://<host>:3000/`
- **微信小程序**：`miniprogram/` 目录，支持「微信一键登录」

---

## 一、快速开始

> 推荐家庭部署直接使用 **Docker**（见下方第九节），免装 Node、易升级。

```bash
cd family-assets
cp .env.example .env          # 修改 JWT_SECRET、管理员账号、微信 AppId/Secret
npm install
npm start                     # 默认监听 3000
```

首次启动会自动创建默认管理员（来自 `.env`）：

```
用户名: admin
密码:   admin123
```

> 登录后请尽快修改默认密码，或在 `.env` 中设置 `ADMIN_DEFAULT_PASSWORD`。

打开浏览器：<http://localhost:3000/login.html>

---

## 二、目录结构

```
family-assets/
├── server.js                  # Express 入口
├── lib/
│   ├── store.js               # CSV / JSON 数据访问
│   ├── users.js               # 用户管理 + bcrypt 密码
│   ├── auth.js                # JWT 鉴权中间件
│   └── wechat.js              # 微信 code2Session
├── scripts/
│   └── init-user.js           # 命令行建用户
├── data/
│   ├── assets.csv             # 资产数据（CSV）
│   ├── categories.json        # 分类
│   └── users.json             # 用户（含 bcrypt 哈希）
├── backups/                   # 定时备份产物
├── public/                    # Web 端页面
│   ├── login.html
│   └── index.html
└── miniprogram/               # 微信小程序源码
```

---

## 三、数据模型

### 资产（CSV: `data/assets.csv`）

| 字段 | 说明 |
| ---- | ---- |
| uuid | 唯一 ID |
| 一级分类 / primaryCategory | 如「电子产品」 |
| 二级分类 / secondaryCategory | 如「手机」 |
| 资产名称 / assetName | 物品名 |
| 数量 / quantity | 数量 |
| 录入时间 / createdAt | ISO 时间 |
| 过期时间 / expiryDate | YYYY-MM-DD |
| 最后更新时间 / updatedAt | 自动维护 |
| 最后更新用户 / updatedBy | 来自登录态用户名 |

### 分类（JSON: `data/categories.json`）

```json
{ "categories": [{ "id": "...", "name": "电子产品", "children": ["手机", "电脑"] }] }
```

### 用户（JSON: `data/users.json`）

| 字段 | 说明 |
| ---- | ---- |
| id | UUID |
| username | 登录名 |
| passwordHash | bcrypt 哈希（永远不出现在 API 响应中） |
| role | `admin` / `member` |
| wxOpenId | 绑定的微信 openid（可空） |
| createdAt / lastLoginAt | 时间戳 |

---

## 四、API 一览

所有 `/api/*`（除 `/api/auth/login` 和 `/api/auth/wx-login`）都需要在 Header 携带：

```
Authorization: Bearer <token>
```

### 登录与用户

| Method | Path | 说明 |
| ------ | ---- | ---- |
| POST | `/api/auth/login` | 账号密码登录，返回 `token` |
| POST | `/api/auth/wx-login` | 小程序登录：传 `code`（首次绑定再带 `username/password`） |
| GET  | `/api/auth/me` | 当前用户 |
| POST | `/api/auth/change-password` | 修改自己的密码 |
| GET  | `/api/users` (admin) | 用户列表 |
| POST | `/api/users` (admin) | 创建用户 |
| DELETE | `/api/users/:id` (admin) | 删除用户 |

### 资产 CRUD

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET | `/api/assets?keyword=&primary=&secondary=&expiringDays=30` | 列表（带过滤） |
| POST | `/api/assets` | 新增 |
| PUT | `/api/assets/:uuid` | 修改 |
| DELETE | `/api/assets/:uuid` | 删除 |

### 分类 CRUD

| Method | Path |
| ------ | ---- |
| GET | `/api/categories` |
| POST / PUT / DELETE | `/api/categories/primary[/:name]` |
| POST / PUT / DELETE | `/api/categories/secondary` |

### 维护

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET | `/api/stats` | 总数、即将/已过期、按一级分类汇总 |
| GET | `/api/export` | 导出 CSV |
| POST | `/api/import` | 上传 CSV 导入 |
| POST | `/api/backup` (admin) | 立即备份 |
| GET | `/api/backups` (admin) | 备份列表 |

---

## 五、定时备份

定时表达式从 `.env` 的 `BACKUP_CRON` 读取，默认 `0 2 * * *`（每天凌晨 2 点）。
最多保留 `BACKUP_KEEP` 份（默认 30），多余的会被清理。

> 同步到云端建议：使用 rsync / 对象存储 SDK 把 `backups/` 目录定期推到 OSS/COS/S3。

---

## 六、微信小程序

1. 在微信公众平台申请小程序，记录 `AppID` 和 `AppSecret`
2. 把 `AppID/AppSecret` 填到服务端 `.env` 的 `WX_APPID` / `WX_SECRET`
3. 用微信开发者工具打开 `miniprogram/`，把 `app.js` 中的 `apiBase` 改成你**已部署**的 https 地址
4. 在小程序后台 → 开发设置 → 服务器域名（request 合法域名）添加你的域名
5. 流程：
   - 用户首次进入小程序 → 用账号密码登录 → 完成首次绑定 → 之后 1-tap 微信登录
   - 或：先填账号密码，点「微信一键登录」一并完成绑定

> 真实环境建议：服务端走 HTTPS（Nginx + Let's Encrypt），并把 `JWT_SECRET` 改成强随机串。

---

## 七、命令行新建用户

```bash
node scripts/init-user.js zhangsan 123456 member
node scripts/init-user.js parent 654321 admin
```

---

## 八、安全注意

- 所有密码均以 `bcrypt` 哈希形式存储
- 所有读写 API 都需登录鉴权
- 默认管理员密码上线前**必须**修改
- `JWT_SECRET` 上线前**必须**改成强随机长字符串
- 数据文件 `data/users.json` 内含密码哈希，请勿对外暴露

---

## 九、Docker 部署（推荐家庭机器使用）

适合部署在家中的 NAS / 旧 Mac mini / 树莓派 / 路由器旁路 Linux 机器等。已内置：

- 多阶段构建，镜像 ≈ 130 MB（基于 `node:20-alpine`）
- 非 root 运行（用户 `app`）+ `tini` 处理信号
- 内置时区 `Asia/Shanghai`，日志/`cron` 按本地时间走
- `data/`（CSV+JSON）、`backups/` 走宿主机卷挂载，**升级镜像不丢数据**
- 自带 `HEALTHCHECK`，访问 `/api/health` 检测存活
- 容器日志按 10MB / 5 文件滚动，避免占满磁盘

### 9.1 一键部署

```bash
cd family-assets
bash docker-run.sh start          # 首次自动复制 .env.example → .env，建 data/backups 目录
```

启动后访问：<http://<家庭机器 IP>:3000/login.html>

常用命令：

```bash
bash docker-run.sh logs           # 看实时日志
bash docker-run.sh restart        # 重启
bash docker-run.sh stop           # 停止
bash docker-run.sh status         # 查看状态
```

### 9.2 手动 docker compose

```bash
cp .env.example .env              # ⚠️ 修改 JWT_SECRET、ADMIN_DEFAULT_PASSWORD
docker compose up -d --build
docker compose logs -f
```

### 9.3 不用 compose，纯 docker

```bash
docker build -t family-assets:latest .
docker run -d --name family-assets \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -v "$PWD/data:/app/data" \
  -v "$PWD/backups:/app/backups" \
  family-assets:latest
```

### 9.4 目录与端口

| 项 | 默认值 | 说明 |
| --- | --- | --- |
| 监听端口 | `3000` | 改 `.env` 的 `PORT` 同时改 compose 的端口映射 |
| 数据目录（宿主） | `./data` | 资产 CSV、分类、用户 JSON |
| 备份目录（宿主） | `./backups` | 定时备份产物，可直接 rsync 到云端 |
| 配置文件 | `./.env` | 修改后需 `restart` 才生效 |

### 9.5 升级

```bash
git pull                         # 或上传新代码
bash docker-run.sh start         # 等同 docker compose up -d --build，自动重建镜像
```

数据放在 `./data` 卷里，**重建容器不会丢失**。

### 9.6 把备份同步到云端（示例：rclone）

```bash
# 在宿主机加一条 crontab，每晚 3:00 把 backups/ 同步到云盘
0 3 * * *  rclone sync /path/to/family-assets/backups remote:family-backups
```

或用 `aws s3 sync` / `coscli sync` / `rsync` 都可，无需改容器。

### 9.7 反向代理（HTTPS）

家用建议 + 微信小程序合法域名都要求 HTTPS。在前面挂 Nginx Proxy Manager / Caddy / Traefik 即可：

```caddyfile
home-assets.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

`Caddy` 会自动签发并续期 Let's Encrypt 证书。

### 9.8 健康检查端点

```bash
curl http://localhost:3000/api/health
# {"status":"ok","uptime":123,"timestamp":"...","version":"1.1.0"}
```

容器编排器（k3s、Portainer、群晖 Container Manager 等）可基于此做自动重启。

### 9.9 树莓派 / ARM 机器

`node:20-alpine` 官方提供多架构镜像（`amd64` / `arm64` / `arm/v7`），直接 `docker compose up -d --build` 即可，无需额外配置。如本机为 `arm/v7`（老树莓派），构建时间略长。

