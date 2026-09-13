#!/usr/bin/env bash
# 生成软著源程序鉴别材料（前 50 页 + 后 50 页，每页 50 行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/docs/软著交存/output"
LINES_PER_PAGE=50
PAGES=50
HEAD_LINES=$((PAGES * LINES_PER_PAGE))
TAIL_LINES=$((PAGES * LINES_PER_PAGE))

mkdir -p "$OUT"
ALL="$OUT/源程序-全部连续.txt"
HEAD_F="$OUT/源程序-前50页.txt"
TAIL_F="$OUT/源程序-后50页.txt"
MERGE="$OUT/源程序-合并交存.txt"
STAT="$OUT/源程序-页数统计.txt"
LIST="$OUT/_filelist.txt"

rm -f "$ALL" "$HEAD_F" "$TAIL_F" "$MERGE" "$STAT" "$LIST"
: > "$ALL"

# 入选目录（相对仓库根）
INCLUDE_DIRS=(
  mobileback/cmd
  mobileback/internal
  client/app
  client/screens
  client/contexts
  client/hooks
  client/utils
  client/components
  mobilemange/src
)

# 收集源文件
: > "$LIST"
for d in "${INCLUDE_DIRS[@]}"; do
  if [[ -d "$ROOT/$d" ]]; then
    find "$ROOT/$d" -type f \( \
      -name '*.go' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
    \) ! -path '*/node_modules/*' ! -path '*/.git/*' ! -name '*.d.ts' \
      | LC_ALL=C sort >> "$LIST"
  fi
done

# 排除过大的库拷贝 / 生成物
grep -v '/heroui/' "$LIST" > "${LIST}.tmp" || true
mv "${LIST}.tmp" "$LIST"

file_count=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  rel="${f#"$ROOT"/}"
  {
    echo ""
    echo "// ========== FILE: ${rel} =========="
    echo ""
    # 统一换行，去掉 CR
    tr -d '\r' < "$f"
    echo ""
  } >> "$ALL"
  file_count=$((file_count + 1))
done < "$LIST"

total_lines=$(wc -l < "$ALL" | tr -d ' ')
total_pages=$(( (total_lines + LINES_PER_PAGE - 1) / LINES_PER_PAGE ))

head -n "$HEAD_LINES" "$ALL" > "$HEAD_F"
tail -n "$TAIL_LINES" "$ALL" > "$TAIL_F"

if [[ "$total_pages" -le 100 ]]; then
  cp "$ALL" "$MERGE"
else
  {
    cat "$HEAD_F"
    echo ""
    echo "// ========== 以下为源程序后部连续 ${PAGES} 页（每页 ${LINES_PER_PAGE} 行） =========="
    echo ""
    cat "$TAIL_F"
  } > "$MERGE"
fi

{
  echo "软件：山途徒步智能决策与安全保障系统 V1.0"
  echo "生成时间：$(date '+%Y-%m-%d %H:%M:%S')"
  echo "入选文件数：${file_count}"
  echo "连续源程序总行数：${total_lines}"
  echo "估算总页数（${LINES_PER_PAGE} 行/页）：${total_pages}"
  echo "前部交存行数：$(wc -l < "$HEAD_F" | tr -d ' ')（目标 ${HEAD_LINES}）"
  echo "后部交存行数：$(wc -l < "$TAIL_F" | tr -d ' ')（目标 ${TAIL_LINES}）"
  echo ""
  echo "入选文件列表："
  sed "s|^$ROOT/||" "$LIST"
} > "$STAT"

rm -f "$LIST"

echo "已生成："
echo "  $ALL"
echo "  $HEAD_F"
echo "  $TAIL_F"
echo "  $MERGE"
echo "  $STAT"
echo "总行数 ${total_lines}，约 ${total_pages} 页。"
