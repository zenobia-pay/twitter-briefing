#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, os, time, urllib.request
from pathlib import Path

BASE = "https://api.browser-use.com/api/v2"
PROFILE_ID = os.getenv("BROWSER_USE_PROFILE_ID", "9e0f01a3-5227-4424-bc58-b9b226110020")

SLOT_INSTRUCTIONS = {
  "6am": "Overnight check: notifications + likes + mentions. No original posts. Return only priority replies and risk flags.",
  "1pm": "Feed scan. Find high-view threads in niche and draft 2-3 reply options per thread. User picks one.",
  "4pm": "Second feed scan same as 1pm. Catch afternoon momentum threads.",
  "6pm": "If worth saying, draft one original post + reply options for active threads. No posting automatically.",
  "11pm": "Day close. Summarize what landed/what didn't and write memory update notes for tomorrow.",
}

def req(api_key: str, method: str, path: str, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    r = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "X-Browser-Use-API-Key": api_key},
    )
    with urllib.request.urlopen(r, timeout=180) as resp:
        return json.loads(resp.read().decode())

def run_task(api_key: str, prompt: str, timeout=1200):
    s = req(api_key, "POST", "/sessions", {"profileId": PROFILE_ID, "persistMemory": True, "keepAlive": False})
    t = req(api_key, "POST", "/tasks", {"task": prompt, "sessionId": s["id"]})
    tid = t["id"]
    start = time.time()
    status = None
    while time.time() - start < timeout:
        status = req(api_key, "GET", f"/tasks/{tid}/status")
        if status.get("status") in {"finished", "failed", "stopped"}:
            break
        time.sleep(10)
    return {"session": s, "task": t, "status": status}

def build_prompt(slot: str, niche: str):
    return f'''You are Ryan's X operator. He does NOT open X.
Niche: {niche}
Slot: {slot}
Instruction: {SLOT_INSTRUCTIONS[slot]}

Constraints:
- Never post anything.
- Only propose actions + drafts.
- Prioritize high-signal, high-view, builder-centric threads.
- Include direct status URLs.

Return strict JSON:
{{
  "slot": "{slot}",
  "niche": "{niche}",
  "summary": "1-2 sentences",
  "threads": [{{"url":"...","author":"...","why":"...","replyOptions":["...","...","..."]}}],
  "originalPostDraft": "string or empty",
  "memoryNotes": ["..."]
}}
'''

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slot", choices=list(SLOT_INSTRUCTIONS.keys()), required=True)
    ap.add_argument("--niche", default="ai-agent-ops")
    ap.add_argument("--outdir", default="ops/runs")
    args = ap.parse_args()

    key = os.getenv("BROWSER_USE_API_KEY")
    if not key:
        raise SystemExit("Missing BROWSER_USE_API_KEY")

    prompt = build_prompt(args.slot, args.niche)
    run = run_task(key, prompt)

    d = dt.datetime.now().strftime("%Y-%m-%d")
    outdir = Path(args.outdir) / d
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f"{args.slot}.json"
    out.write_text(json.dumps({"prompt": prompt, "run": run}, indent=2))
    print(out)

if __name__ == "__main__":
    main()
