# 家庭资产管理系统

家庭物品 / 证件 / 票据的录入、查询、过期提醒，一站式管理。

- **服务端**：Node.js + Express，数据存储为 CSV + JSON 文件，方便定期同步到云端
- **Web 前端**：纯静态页面，访问 `http://<host>:3000/`
- **微信小程序**：`miniprogram/` 目录，支持「微信一键登录」
- **MCP Server**：支持 AI Agent 直接操作资产数据（增删查改、分类管理）
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
├── server.js                  # Express 入口（装配中间件、挂路由、启动服务）
├── lib/                       # 基础能力层
│   ├── auth.js                #   JWT 签发/校验 + authRequired / adminOnly
│   ├── backup.js              #   备份服务（立即 + 定时 cron）
│   ├── store.js               #   CSV / JSON 数据访问，统一表头、BACKUP_DIR
│   ├── users.js               #   用户 CRUD + bcrypt + 默认管理员初始化
│   ├── util.js                #   asyncHandler / HttpError / errorHandler / writeCsvFile
│   └── wechat.js              #   微信小程序 code2Session（Node 原生 https）
├── routes/                    # 业务路由层（按域拆分）
│   ├── auth.js                #   /api/auth/{login, wx-login, me, change-password}
│   ├── users.js               #   /api/users（仅管理员）
│   ├── assets.js              #   /api/assets CRUD（支持关键词/分类/过期天数过滤）
│   ├── categories.js          #   /api/categories 一/二级 CRUD
│   └── maintenance.js         #   /api/{stats, export, import, backup, backups}
├── scripts/
│   └── init-user.js           # 命令行建用户
├── data/                      # 运行时数据（.gitignore 中，不入库）
│   ├── assets.csv             #   资产数据（CSV）
│   ├── categories.json        #   分类
│   └── users.json             #   用户（含 bcrypt 哈希）
├── backups/                   # 定时备份产物（.gitignore）
├── public/                    # Web 端（纯静态）
│   ├── login.html             #   登录页
│   └── index.html             #   主页（资产/分类/用户/备份）
├── miniprogram/               # 微信小程序源码
│   ├── app.js / app.json / app.wxss
│   ├── utils/api.js           #   带 Authorization 的 request 封装
│   └── pages/                 #   login / list / edit / categories / profile
├── Dockerfile                 # 多阶段构建（alpine:3.19 + 裸 node 二进制）
├── docker-compose.yml         # 一键编排，挂载 data/ backups/
├── docker-run.sh              # 家庭部署懒人脚本
├── .env.example               # 所有可配置项模板
└── README.md
```

### 设计分层

```
             ┌───────────────┐
请求 ──────▶ │  routes/*.js  │  业务 API，throw HttpError
             └──────┬────────┘
                    │
             ┌──────▼────────┐
             │  lib/*.js     │  基础能力：auth / store / backup / util
             └──────┬────────┘
                    │
             ┌──────▼────────┐
             │  data / FS    │  CSV + JSON 持久化 + 备份目录
             └───────────────┘
```

所有异步路由用 `asyncHandler` 包装，异常统一抛 `HttpError(status, msg)`，由 `errorHandler` 兜底转成 `{ error: '...' }` JSON 响应。

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

- 多阶段构建，**镜像 ≈ 167 MB**（基于 `alpine:3.19` + 拷贝裸 node 二进制，去掉 npm/headers）
- 非 root 运行（用户 `app`）+ `tini` 处理信号
- 内置时区 `Asia/Shanghai`，日志/`cron` 按本地时间走
- `data/`（CSV+JSON）、`backups/` 走宿主机卷挂载，**升级镜像不丢数据**
- 自带 `HEALTHCHECK`，访问 `/api/health` 检测存活（用 node 内置 http，不依赖 wget/curl）
- 容器日志按 10MB / 5 文件滚动，避免占满磁盘
- 运行时内存占用约 60-80 MB，CPU 空闲约 0.1%

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


---

## 十、MCP Server（AI Agent 接入）

项目内置 MCP Server（Model Context Protocol），让 AI Agent（如 CodeBuddy、Claude Desktop 等）可以通过自然语言直接操作家庭资产数据。

支持两种传输模式：
- **HTTP 模式（推荐）**：NAS 容器直接暴露 `/mcp` 端点，AI 客户端通过局域网 HTTP 连接
- **stdio 模式**：通过 SSH 隧道连接容器内的 `mcp-server.js`

### 10.1 提供的 Tools

| Tool | 说明 |
| --- | --- |
| `list_assets` | 查询资产列表（支持关键词/分类/过期天数过滤） |
| `add_asset` | 新增资产 |
| `update_asset` | 修改资产（通过 uuid） |
| `delete_asset` | 删除资产 |
| `get_stats` | 统计：总数、7 天/30 天内过期、已过期、按分类汇总 |
| `list_categories` | 列出所有分类 |
| `add_category` | 新增一级/二级分类 |
| `rename_category` | 重命名分类（自动同步资产） |
| `delete_category` | 删除分类 |

### 10.2 接入配置

#### 方式 A：HTTP 模式（推荐，部署在 NAS 上直接用）

NAS 容器启动后，MCP 端点自动可用：`http://<NAS_IP>:3000/mcp`

AI 客户端 MCP 配置：

```json
{
  "mcpServers": {
    "family-assets": {
      "type": "streamableHttp",
      "url": "http://192.168.31.92:3000/mcp"
    }
  }
}
```

> 把 `192.168.31.92` 换成你 NAS 的实际局域网 IP。

**无需 SSH、无需免密配置、无需本地装 Node**。只要 AI 客户端和 NAS 在同一个局域网即可。

#### 方式 B：stdio 模式（通过 SSH，备用）

```json
{
  "mcpServers": {
    "family-assets": {
      "command": "ssh",
      "args": ["你的NAS用户名@192.168.31.92", "docker exec -i family-assets node /app/mcp-server.js"]
    }
  }
}
```

> 需要提前配好 SSH 免密登录（`ssh-copy-id`）。

### 10.3 使用示例

接入后可以直接对 AI 说：

- "帮我查一下家里有哪些证件快过期了"
- "把父亲护照的过期时间改成 2028-12-31"
- "新增一个资产：电子产品/手机/iPhone 16 Pro，数量 1"
- "把二级分类「手机」改名为「智能手机」"
- "统计一下家里资产总数和各分类数量"

AI 会自动调用对应的 MCP Tool 完成操作，数据直接写入 `data/assets.csv`，Web 界面同步可见。

### 10.4 测试

```bash
# HTTP 模式测试
curl -X POST http://192.168.31.92:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# stdio 模式测试
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node mcp-server.js
```
