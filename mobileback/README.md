# 山途 mobileback（Go）

面向百万级用户预期的主 API 服务。本地默认 **SQLite** 即可跑通；`docker-compose.yml` 提供 Postgres + Redis 供生产形态演练。

## 快速开始

```bash
# 1) 需要本机已安装 Go 1.22+
cd mobileback

# 2) 建库并导入（种子真相源：seeds/*.json）
make seed

# 3) 启动 API（默认 :9092）
make run
```

健康检查：`GET http://localhost:9092/api/v1/health`

登录（演示验证码 `1234`）：

```bash
curl -X POST http://localhost:9092/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","code":"1234"}'
```

## 与现有 client 对接

```bash
# client/.env 或启动环境
EXPO_PUBLIC_BACKEND_BASE_URL=http://localhost:9092
```

Client 请固定 **9092**。改路线/帖子/清单等演示数据时，直接编辑 `seeds/*.json` 后重新 `make seed`。

轨迹（walk / 标注 / 发布）已落库：`walk_sessions`、`walk_annotations`、`published_tracks`；官方标注由路线 `risk_markers` 合成。

真能力（媒体上传、Open-Meteo 天气、SOS 通知接口、离线包 CDN、传感器）见 [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)。

## 端到端冒烟

```bash
# 另开终端先 make run，再：
make e2e
# 或 MOBILEBACK_BASE_URL=http://127.0.0.1:9092 bash scripts/e2e-smoke.sh
```

覆盖：登录 → 发现/路线详情 → 加入行程 → 清单勾选 → 社区看板+发帖 → 守护 start/checkin/stop。

## 目录

- `cmd/api` — HTTP 服务
- `cmd/seed` — 种子导入
- `internal/httpapi` — `/api/v1` 兼容层
- `internal/domain` — 发现页等业务规则
- `seeds/` — 演示数据 JSON（唯一种子源）
- `data/mountpath.db` — 本地 SQLite（gitignore）

## 生产注意

- 更换 `JWT_SECRET`
- 将 `DATABASE_URL` 切到 Postgres，并接连接池
- Redis 用于验证码/限流/缓存（本期骨架已预留 compose）
- 短信、天气、对象存储按环境变量接入，勿写死密钥
