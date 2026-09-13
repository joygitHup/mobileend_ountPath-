#!/usr/bin/env bash
# 本地开发：mobileback(:9092) + Expo client(:5000)
# 替代 .cozeproj/scripts/dev_run.sh（仍会找已删除的 Express server/:9091，勿直接用）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${COZE_LOG_DIR:-$ROOT_DIR/logs}"
mkdir -p "$LOG_DIR"

API_PORT="${PORT:-9092}"
EXPO_PORT="${EXPO_PORT:-5000}"
API_BASE="http://127.0.0.1:${API_PORT}"
export EXPO_PUBLIC_BACKEND_BASE_URL="${EXPO_PUBLIC_BACKEND_BASE_URL:-$API_BASE}"
# 勿把 Metro 代理指到错误端口；业务请求走 EXPO_PUBLIC_BACKEND_BASE_URL
unset EXPO_PACKAGER_PROXY_URL || true
export PATH="${HOME}/.local/go/bin:/usr/local/go/bin:${PATH:-}"

API_PID=""
EXPO_PID=""

cleanup() {
  if [[ -n "${EXPO_PID}" ]] && kill -0 "$EXPO_PID" 2>/dev/null; then
    kill "$EXPO_PID" 2>/dev/null || true
  fi
  if [[ -n "${API_PID}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

is_port_listening() {
  lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_port() {
  local port=$1 retries=${2:-30}
  local i
  for i in $(seq 1 "$retries"); do
    if is_port_listening "$port"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

echo "==================== 山途本地开发 ===================="
echo "主后端 mobileback :${API_PORT}"
echo "Expo client       :${EXPO_PORT}"
echo "EXPO_PUBLIC_BACKEND_BASE_URL=${EXPO_PUBLIC_BACKEND_BASE_URL}"
echo "（已跳过 Express :9091；主后端为 mobileback :${API_PORT}）"
echo ""

# --- mobileback ---
if is_port_listening "$API_PORT"; then
  echo "端口 ${API_PORT} 已在监听，复用现有 mobileback。"
else
  echo "启动 mobileback..."
  pushd "$ROOT_DIR/mobileback" >/dev/null
  if [[ -x ./bin/api ]]; then
    ( PORT="$API_PORT" nohup ./bin/api >>"$LOG_DIR/mobileback.log" 2>&1 & echo $! >"$LOG_DIR/mobileback.pid" )
  else
    ( PORT="$API_PORT" nohup go run ./cmd/api >>"$LOG_DIR/mobileback.log" 2>&1 & echo $! >"$LOG_DIR/mobileback.pid" )
  fi
  popd >/dev/null
  API_PID="$(cat "$LOG_DIR/mobileback.pid" 2>/dev/null || true)"
  if ! wait_port "$API_PORT" 40; then
    echo "错误：mobileback 未能在 :${API_PORT} 就绪。日志：$LOG_DIR/mobileback.log"
    tail -n 40 "$LOG_DIR/mobileback.log" 2>/dev/null || true
    exit 1
  fi
  echo "mobileback 已就绪，PID=${API_PID:-unknown}"
fi

# --- Expo ---
if is_port_listening "$EXPO_PORT"; then
  echo "端口 ${EXPO_PORT} 已占用。若不是本仓库的 Expo，请先释放端口。"
  echo "可手动：cd client && EXPO_PUBLIC_BACKEND_BASE_URL=${EXPO_PUBLIC_BACKEND_BASE_URL} npx expo start --port ${EXPO_PORT}"
  echo "API 已可用：${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/health"
  # 保持 API 进程（若本脚本拉起）不在 EXIT 时杀掉
  trap - EXIT
  exit 0
fi

echo "启动 Expo (client)..."
pushd "$ROOT_DIR/client" >/dev/null
(
  EXPO_NO_DEPENDENCY_VALIDATION=1 \
  EXPO_PUBLIC_BACKEND_BASE_URL="$EXPO_PUBLIC_BACKEND_BASE_URL" \
  npx expo start --clear --port "$EXPO_PORT" \
    >>"$LOG_DIR/client.log" 2>&1
) &
EXPO_PID=$!
popd >/dev/null

if ! wait_port "$EXPO_PORT" 60; then
  echo "错误：Expo 未能在 :${EXPO_PORT} 就绪。日志：$LOG_DIR/client.log"
  tail -n 40 "$LOG_DIR/client.log" 2>/dev/null || true
  exit 1
fi

echo ""
echo "==================== 启动完成 ===================="
echo "  API   ${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/health"
echo "  Expo  http://127.0.0.1:${EXPO_PORT}"
echo "  日志  $LOG_DIR/mobileback.log  $LOG_DIR/client.log"
echo "按 Ctrl+C 结束本脚本拉起的进程。"
echo ""

# 前台挂住，方便 Ctrl+C 清理
wait "$EXPO_PID"
