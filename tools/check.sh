#!/usr/bin/env bash
set -uo pipefail

failed=0
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

bg_stages=()
bg_pids=()
bg_outs=()

run_check() {
  local stage="$1"
  shift
  local output
  if output=$("$@" 2>&1); then
    echo "$stage ok"
  else
    echo "$stage FAILED"
    echo "$output"
    failed=1
  fi
}

run_check_background() {
  local stage="$1"
  shift
  local out="$tmpdir/$stage"
  "$@" >"$out" 2>&1 &
  bg_stages+=("$stage")
  bg_pids+=($!)
  bg_outs+=("$out")
}

wait_background() {
  local i
  for i in "${!bg_stages[@]}"; do
    if wait "${bg_pids[$i]}"; then
      echo "${bg_stages[$i]} ok"
    else
      echo "${bg_stages[$i]} FAILED"
      cat "${bg_outs[$i]}"
      failed=1
    fi
  done
}

run_check_background "browser_test" node --run test:browser -- --reporter=minimal --changed

run_check "tsc" node --run tsc
run_check "lint" node --run lint:fix
run_check "unit_test" node --run test:unit -- --reporter=minimal --changed
run_check "knip" node --run knip

wait_background

exit $failed
