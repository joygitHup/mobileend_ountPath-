# 模块与接口对照

基址：`{VITE_API_BASE}/api/v1/admin`，Header：`Authorization: Bearer <token>`

| 管理台页面 | API |
|------------|-----|
| 登录 | `POST /api/v1/auth/login`（校验 role 为 ops/admin） |
| 概览 | `GET /dashboard/summary` · `GET /dashboard/insights` |
| 路线 | `GET/POST/PATCH/DELETE /routes` |
| 官方轨迹 | `GET/PUT /tracks/:routeId` · `GET/PATCH /published-tracks` |
| 清单模板 | `GET/PUT /checklist-templates/:id` |
| 领队 | `GET/POST/PATCH/DELETE /leaders` |
| 工具 | `GET/POST/PATCH/DELETE /tools` |
| 社区 | `GET/PATCH/DELETE /posts` · `GET/DELETE /comments` |
| 用户 | `GET/PATCH /users` |
| 安全台 | `GET/PATCH /guard/sessions` · `GET /sos` |
| 系统 | `GET/PUT /legal-docs` · `GET/PUT /camps` · `GET/PUT /signals` · `GET /integrations/status` · `GET /audit-logs` |
