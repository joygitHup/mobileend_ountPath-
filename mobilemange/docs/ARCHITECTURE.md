# 山途 mobilemange 技术架构

## 定位

`mobilemange/` 是山途（MountPath）的 **Web 运营管理平台**，与 Expo 客户端解耦，仅服务运营/管理员。

## 架构

```
Expo App (:5000) ──► mobileback /api/v1/*        (:9092)
mobilemange (:9093) ──► mobileback /api/v1/admin/* (:9092)
                              │
                              ▼
                         SQLite (同一库)
```

- **前端**：Vite + React 19 + TypeScript + Ant Design 5 + React Router 7 + TanStack Query
- **后端**：扩展既有 Go `mobileback`，JWT `role`（`user` / `ops` / `admin`）+ `adminRequired` 中间件
- **不做**：独立管理微服务、第二套数据库、复活 Express `server/`

## 权限

| 角色 | 能力 |
|------|------|
| user | 仅 C 端 |
| ops | 内容 CRUD、社区审核、安全台 |
| admin | ops + 用户角色变更、系统配置 |

演示管理员：手机号 `13800000000`，验证码 `1234`（seed 后 `role=admin`）。

## 三期能力

1. **P0** 登录、看板、路线/轨迹/清单/领队/工具
2. **P1** 社区审核、用户治理、守护/SOS
3. **P2** 洞察看板、法律文案、营地/信号、审计日志
