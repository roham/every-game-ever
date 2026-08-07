#!/usr/bin/env bash
# EGE loop supervisor — the watchdog that keeps the build loop alive.
# Canon: SPEC-013 Loop 0 (health watchdog), infinite-loops (wall-clock kill
# switch at the runtime layer), state persistence (loss <= 1 min).
#
# Responsibilities (only these; workers do the work):
#   1. Initialize state (budget timestamps) on first run.
#   2. Watch heartbeat. If a live worker stalls, escalate to a headless
#      resume session (claude -p with .loop/resume-prompt.md).
#   3. Enforce the 24h wall-clock budget: write FINAL report and exit.
#   4. Write the 12h mid report.
#   5. Paper trail to .loop/phases.log. Never spawn-resume more than a cap.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$ROOT/.loop/state.json"
HEARTBEAT="$ROOT/.loop/heartbeat"
LOG="$ROOT/.loop/phases.log"
RESUME_PROMPT="$ROOT/.loop/resume-prompt.md"
STALL_SECONDS=600          # heartbeat older than this = stalled
MAX_STALL=3                # stalls before a headless resume is spawned
MAX_SPAWNS=25              # absolute resume-session cap per budget cycle
TICK_SECONDS=60
MID_HOURS=12
BUDGET_HOURS_OVERRIDE=""   # set e.g. "6" for tests

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; echo "$*"; }

read_state() { python3 -c 'import json, sys; print(json.dumps(json.load(open(sys.argv[1]))))' "$STATE"; }

# --- init -----------------------------------------------------------------
if [ ! -f "$STATE" ]; then
  log "FATAL state missing"; exit 1
fi

NOW="$(date -u +%s)"
BUDGET_END="$(read_state | python3 -c 'import json,sys; print(json.load(sys.stdin).get("budget_end_at") or "")')"
if [ -z "$BUDGET_END" ] || [ "$BUDGET_END" = "null" ]; then
  HOURS="${BUDGET_HOURS_OVERRIDE:-24}"
  python3 - "$STATE" "$HOURS" <<'PY'
import json, sys, time
st = json.load(open(sys.argv[1]))
st["budget_hours"] = float(sys.argv[2])
st["started_at"] = time.time()
st["budget_end_at"] = st["started_at"] + st["budget_hours"] * 3600
json.dump(st, open(sys.argv[1], "w"), indent=2)
PY
  log "budget initialized: $(read_state | python3 -c 'import json,sys; s=json.load(sys.stdin); print(int(s["budget_end_at"]-s["started_at"]), "seconds")')"
fi

log "SUPERVISOR UP pid=$$"

spawn_resume() {
  log "RESUME spawn #$(read_state | python3 -c 'import json,sys; print(json.load(sys.stdin)["resume_spawns"])')"
  cd "$ROOT" || return 1
  # Headless worker, bounded: max 90 turns, 40 min hard timeout, edit-permit
  # mode (no destructive ops allowed by the worker).
  timeout 2400 claude -p "$(cat "$RESUME_PROMPT")" \
    --permission-mode acceptEdits --max-turns 90 \
    --output-format json >> "$ROOT/.loop/resume-output-$RANDOM.log" 2>&1
  local rc=$?
  python3 - "$STATE" <<'PY'
import json, sys
st = json.load(open(sys.argv[1]))
st["resume_spawns"] += 1
st["stall_count"] = 0
json.dump(st, open(sys.argv[1], "w"), indent=2)
PY
  log "RESUME finished rc=$rc"
  touch "$HEARTBEAT"
  return 0
}

while true; do
  NOW="$(date -u +%s)"
  ST="$(read_state)"
  BEND="$(echo "$ST" | python3 -c 'import json,sys,time; print(int(json.load(sys.stdin)["budget_end_at"]))')"

  # --- wall-clock kill switch (runtime layer, no exceptions) ---
  if [ "$NOW" -ge "$BEND" ]; then
    if ! echo "$ST" | python3 -c 'import json,sys; raise SystemExit(0 if json.load(sys.stdin)["final_report_written"] else 1)'; then
      log "BUDGET EXHAUSTED — writing final report"
      "$ROOT/.loop/write-report.sh" final
    fi
    log "SUPERVISOR EXIT at budget"
    exit 0
  fi

  # --- 12h mid report ---
  if ! echo "$ST" | python3 -c 'import json,sys; raise SystemExit(0 if json.load(sys.stdin)["mid_report_written"] else 1)'; then
    ELAPSED="$(python3 -c "print(($NOW - $(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["started_at"])')) / 3600)")"
    if python3 -c "import sys; raise SystemExit(0 if float('$ELAPSED') >= $MID_HOURS else 1)"; then
      "$ROOT/.loop/write-report.sh" mid
      python3 - "$STATE" <<'PY'
import json, sys
st = json.load(open(sys.argv[1])); st["mid_report_written"] = True
json.dump(st, open(sys.argv[1], "w"), indent=2)
PY
      log "MID report written at ${ELAPSED}h"
    fi
  fi

  # --- stall detection + escalation ---
  HB="$(stat -f %m "$HEARTBEAT" 2>/dev/null || echo 0)"
  AGE=$(( NOW - HB ))
  LAST_PHASE="$(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["phase"])')"
  LAST_EVENT="$(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["last_event"])')"

  if [ "$AGE" -gt "$STALL_SECONDS" ]; then
    STALLS="$(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["stall_count"])')"
    STALLS=$(( STALLS + 1 ))
    python3 - "$STATE" "$STALLS" <<'PY'
import json, sys
st = json.load(open(sys.argv[1])); st["stall_count"] = int(sys.argv[2])
json.dump(st, open(sys.argv[1], "w"), indent=2)
PY
    log "STALL #$STALLS heartbeat age=${AGE}s phase=$LAST_PHASE event=$LAST_EVENT"
    if [ "$STALLS" -ge "$MAX_STALL" ]; then
      SPAWNS="$(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["resume_spawns"])')"
      NOW_TS="$(date -u +%FT%TZ)"
      python3 - "$STATE" "$NOW_TS" <<'PY'
import json, sys
st = json.load(open(sys.argv[1])); st["worker"] = "headless"; st["last_event"] = "resume requested " + sys.argv[2]
json.dump(st, open(sys.argv[1], "w"), indent=2)
PY
      if [ "$SPAWNS" -lt "$MAX_SPAWNS" ]; then
        touch "$HEARTBEAT"
        spawn_resume
      else
        log "FATAL spawn cap reached — loop parked; final report at budget"
      fi
    fi
  else
    # healthy: reset stall accumulation as long as SOMEONE is ticking
    STALLS="$(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["stall_count"])')"
    if [ "$STALLS" != "0" ]; then
      python3 - "$STATE" <<'PY'
import json, sys
st = json.load(open(sys.argv[1])); st["stall_count"] = 0
json.dump(st, open(sys.argv[1], "w"), indent=2)
PY
      log "stall counter reset (heartbeat healthy)"
    fi
  fi

  sleep "$TICK_SECONDS"
done
