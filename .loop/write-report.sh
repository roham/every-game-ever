#!/usr/bin/env bash
# Writes docs/WAKEUP-REPORT.md (mid or final). Invoked by supervisor.sh.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-final}"

python3 - "$ROOT" "$MODE" <<'PY'
import json, sys, subprocess, time, os
root, mode = sys.argv[1], sys.argv[2]
st = json.load(open(os.path.join(root, ".loop", "state.json")))
out = [f"# Every Game Ever — {'FINAL' if mode == 'final' else 'MID'} LOOP REPORT (autonomous)", ""]
out.append(f"- Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
out.append(f"- Started: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(st['started_at']))}")
out.append(f"- Budget: {st['budget_hours']}h — ends {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(st['budget_end_at']))}")
out.append(f"- Phase: {st['phase']} · Worker: {st['worker']} · Resume spawns: {st['resume_spawns']}")
out.append("")
out.append("## Phase status")
for p, v in st["phases"].items():
    out.append(f"- **{p}** ({v.get('note','')}): {v['status']}{' — ' + v.get('note2','') if v.get('note2') else ''}")
out.append("")
try:
    r = subprocess.run(["git", "-C", root, "log", "--oneline", "-15"], capture_output=True, text=True, timeout=10)
    out.append("## Recent commits")
    out.append("```")
    out.append(r.stdout.strip())
    out.append("```")
    out.append("")
except Exception:
    pass
logf = os.path.join(root, ".loop", "phases.log")
if os.path.isfile(logf):
    out.append("## Loop log (tail 40)")
    out.append("```")
    out.append("\n".join(open(logf).read().splitlines()[-40:]))
    out.append("```")
    out.append("")
out.append("## Next actions for Roham")
out.append("- Read the README + open the deployed site (if any URL below).")
out.append("- Review phase acceptance evidence in .loop/phases.log.")
out.append("- Ask Dexter for anything you want changed; the loop parks after budget.")
os.makedirs(os.path.join(root, "docs"), exist_ok=True)
open(os.path.join(root, "docs", "WAKEUP-REPORT.md"), "w").write("\n".join(out) + "\n")
print(f"{mode} report written")
PY