#!/usr/bin/env bash
# 仅提示：生产构建请用 mobileback，勿再走已删除的 Express server/
set -euo pipefail
cat <<'EOF'
Express `server/` 已移除，`.cozeproj/scripts/prod_*.sh` 会失败。

请使用：
  cd mobileback && make run          # 主 API :9092
  cd client && eas build …           # 或 Expo 发布流程
  pnpm --filter mobilemange build    # 运营管理台

详见 mobileback/README.md、client/eas.json
EOF
exit 1
