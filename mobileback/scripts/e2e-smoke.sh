#!/usr/bin/env bash
# mobileback 端到端冒烟：登录 → 发现 → 行程 → 清单 → 社区 → 守护
set -euo pipefail

BASE="${MOBILEBACK_BASE_URL:-http://127.0.0.1:9092}"
API="$BASE/api/v1"
PHONE="${E2E_PHONE:-1390000$(printf '%04d' $((RANDOM % 10000)))}"
CODE="${E2E_OTP:-1234}"
FAIL=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

json_get() {
  python3 -c "import sys,json; d=json.load(sys.stdin); $1"
}

req() {
  local method="$1" path="$2"
  shift 2
  curl -sS -f -X "$method" "$API$path" \
    -H "Content-Type: application/json" \
    ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
    "$@"
}

check() {
  local name="$1"
  if eval "$2"; then
    green "OK  $name"
  else
    red "FAIL $name"
    FAIL=1
  fi
}

step "0. health ($BASE)"
HEALTH=$(curl -sS -f "$API/health")
check "health status" "echo \"\$HEALTH\" | grep -q ok"

step "1. login ($PHONE / $CODE)"
LOGIN=$(curl -sS -f -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}")
TOKEN=$(echo "$LOGIN" | json_get 'print(d["data"]["token"])')
USER_ID=$(echo "$LOGIN" | json_get 'print(d["data"]["user"]["id"])')
check "jwt issued" "[[ -n \"\$TOKEN\" ]]"
check "user id" "[[ -n \"\$USER_ID\" ]]"

step "2. discover"
DISCOVER=$(req GET /routes/discover)
ROUTE_ID=$(echo "$DISCOVER" | json_get '
sections=d.get("data",{}).get("sections") or d.get("data") or []
# sections may be list of {items:[...]} or flat
rid=None
if isinstance(sections, list):
  for s in sections:
    items=s.get("items") if isinstance(s,dict) else None
    if items:
      rid=items[0].get("id"); break
    if isinstance(s,dict) and s.get("id"):
      rid=s["id"]; break
if not rid:
  data=d.get("data")
  if isinstance(data,dict):
    for k in ("featured","nearby","weekend","routes"):
      arr=data.get(k) or []
      if arr and isinstance(arr,list) and isinstance(arr[0],dict):
        rid=arr[0].get("id"); break
print(rid or "")
')
if [[ -z "$ROUTE_ID" ]]; then
  ROUTES=$(req GET /routes)
  ROUTE_ID=$(echo "$ROUTES" | json_get 'print((d.get("data") or [{}])[0].get("id",""))')
fi
check "route id from discover/list" "[[ -n \"\$ROUTE_ID\" ]]"
DETAIL=$(req GET "/routes/$ROUTE_ID")
check "route detail" "echo \"\$DETAIL\" | json_get 'assert d.get(\"data\",{}).get(\"id\") or d.get(\"data\",{}).get(\"name\"); print(1)' >/dev/null"

step "3. trip (join)"
# tomorrow 07:00 local as ISO — use python
DEP=$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(days=1)).replace(hour=7,minute=0,second=0,microsecond=0).isoformat().replace("+00:00","Z"))')
TRIP=$(req POST /trips -d "{\"route_id\":\"$ROUTE_ID\",\"departure_at\":\"$DEP\"}")
TRIP_ID=$(echo "$TRIP" | json_get 'print(d["data"]["id"])')
check "trip created" "[[ -n \"\$TRIP_ID\" ]]"
BOARD=$(req GET /trips/board)
check "trips board has current" "echo \"\$BOARD\" | json_get 'c=d.get(\"data\",{}).get(\"current\"); assert c and c.get(\"id\"); print(1)' >/dev/null"
# disclaimer if needed
req POST "/trips/$TRIP_ID/disclaimer" -d '{}' >/dev/null || true

step "4. checklist"
CL=$(req GET "/checklist/$ROUTE_ID")
ITEM_ID=$(echo "$CL" | json_get '
data=d.get("data") or {}
items=data.get("items") or []
print(items[0]["id"] if items else "")
')
check "checklist items" "[[ -n \"\$ITEM_ID\" ]]"
req POST "/checklist/$ROUTE_ID/toggle" -d "{\"item_id\":\"$ITEM_ID\",\"checked\":true}" >/dev/null
check "checklist toggle" "true"

step "5. community"
CB=$(req GET /community/board)
check "board conditions" "echo \"\$CB\" | json_get 'assert isinstance(d[\"data\"].get(\"conditions\"), list); print(1)' >/dev/null"
check "board guides" "echo \"\$CB\" | json_get 'assert isinstance(d[\"data\"].get(\"guides\"), list); print(1)' >/dev/null"
POST=$(req POST /community/posts -d "{\"type\":\"question\",\"title\":\"E2E求助\",\"content\":\"端到端回归发帖\",\"route_id\":\"$ROUTE_ID\"}")
POST_ID=$(echo "$POST" | json_get 'print(d["data"]["id"])')
check "create post" "[[ -n \"\$POST_ID\" ]]"

step "6. guard"
GUARD=$(req POST /guard/start -d "{\"route_id\":\"$ROUTE_ID\",\"trip_id\":\"$TRIP_ID\"}")
GS_ID=$(echo "$GUARD" | json_get 'print(d["data"]["id"])')
check "guard start" "[[ -n \"\$GS_ID\" ]]"
req POST /guard/checkin -d "{\"session_id\":\"$GS_ID\",\"lat\":30.12,\"lng\":118.56}" >/dev/null
check "guard checkin" "true"
req POST /guard/stop -d "{\"session_id\":\"$GS_ID\"}" >/dev/null || \
  req POST /guard/stop -d '{}' >/dev/null || true
check "guard stop (best-effort)" "true"

echo
if [[ "$FAIL" -eq 0 ]]; then
  green "E2E PASS  route=$ROUTE_ID trip=$TRIP_ID post=$POST_ID"
  exit 0
else
  red "E2E FAIL — see steps above"
  exit 1
fi
