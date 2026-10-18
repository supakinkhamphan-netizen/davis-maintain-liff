#!/bin/sh
# Every board suite, from the repo root. Exit 1 if any is red.
cd "$(dirname "$0")/.." || exit 1
status=0
for t in tests/*.test.js; do
  printf '%-28s ' "$(basename "$t")"
  out=$(node "$t" 2>&1); code=$?
  echo "$out" | tail -1
  if [ $code -ne 0 ]; then echo "$out" | grep -E "^FAIL|Error" | head -8; status=1; fi
done
exit $status
