# 山途运营管理平台（mobilemange）

Web 运营后台，对接主后端 `mobileback`（`:9092`）的 `/api/v1/admin/*`。

## 本地启动

```bash
# 终端 1 — 后端
cd mobileback && make run

# 终端 2 — 管理端
pnpm --filter mobilemange dev
# → http://127.0.0.1:9093
```

或根目录：`pnpm dev:admin`

## 演示登录

| 手机号 | 验证码 | 角色 |
|--------|--------|------|
| `13800000000` | `1234` | admin（需已 `make seed`） |

仅 `ops` / `admin` 可进入管理台。

## 文档

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/MODULES.md](docs/MODULES.md)
