#!/usr/bin/env python3
"""
Filter a handle list down to likely writers using X API v2 user bios.

Input: one handle per line (e.g. @foo)
Output:
  - JSON with scored profiles
  - TXT with only writer handles (copy/paste friendly)

Usage:
  set -a && source ~/.openclaw/workspace/twitter-deep-dive/.env && set +a
  python3 scraper/filter_writers.py \
    --in scraper/manabovetown-following-handles.txt \
    --out-json scraper/manabovetown-writers.json \
    --out-txt scraper/manabovetown-writers-handles.txt
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List

API_BASE = "https://api.twitter.com/2"

POSITIVE_TERMS = [
    "writer", "author", "novelist", "essayist", "poet", "journalist", "reporter",
    "editor", "critic", "columnist", "screenwriter", "playwright", "biographer",
    "newsletter", "substack", "writes", "writing", "book", "books", "magazine",
]

NEGATIVE_TERMS = [
    "bot", "trader", "crypto", "marketing agency", "growth hacker", "onlyfans", "memecoin"
]


def api_get(path: str, token: str, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
    qs = ""
    if params:
        qs = "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(
        API_BASE + path + qs,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "openclaw-writer-filter/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def score_profile(name: str, bio: str, url: str) -> tuple[int, List[str]]:
    text = f"{name} {bio} {url}".lower()
    score = 0
    reasons: List[str] = []

    for t in POSITIVE_TERMS:
        if re.search(rf"\b{re.escape(t)}\b", text):
            score += 2
            reasons.append(f"+{t}")

    if "@" in bio and any(x in bio.lower() for x in ["editor", "writer", "author"]):
        score += 1
        reasons.append("+professional-bio-pattern")

    for t in NEGATIVE_TERMS:
        if t in text:
            score -= 2
            reasons.append(f"-{t}")

    # light penalty for empty bios
    if not bio.strip():
        score -= 1
        reasons.append("-empty-bio")

    return score, reasons


def chunked(xs: List[str], n: int):
    for i in range(0, len(xs), n):
        yield xs[i:i+n]


def load_handles(path: str) -> List[str]:
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            h = line.strip()
            if not h:
                continue
            h = h.lstrip("@").strip()
            if h:
                out.append(h)
    # dedupe preserve order
    seen = set(); uniq = []
    for h in out:
        k = h.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(h)
    return uniq


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", required=True)
    ap.add_argument("--out-json", required=True)
    ap.add_argument("--out-txt", required=True)
    ap.add_argument("--threshold", type=int, default=2, help="Writer score threshold")
    ap.add_argument("--token-env", default="TWITTER_BEARER_TOKEN")
    args = ap.parse_args()

    token = os.getenv(args.token_env)
    if not token:
        raise SystemExit(f"Missing token env var: {args.token_env}")

    handles = load_handles(args.in_path)
    profiles: List[Dict[str, Any]] = []

    for batch in chunked(handles, 100):
        r = api_get(
            "/users/by",
            token,
            params={
                "usernames": ",".join(batch),
                "user.fields": "id,name,username,description,url,verified,public_metrics",
            },
        )
        data = r.get("data") or []
        by_u = {x.get("username", "").lower(): x for x in data}

        for h in batch:
            u = by_u.get(h.lower())
            if not u:
                profiles.append({"handle": f"@{h}", "found": False, "score": -99, "reasons": ["not-found"]})
                continue
            name = u.get("name", "")
            bio = u.get("description", "") or ""
            url = u.get("url", "") or ""
            score, reasons = score_profile(name, bio, url)
            profiles.append({
                "handle": f"@{h}",
                "found": True,
                "name": name,
                "bio": bio,
                "url": url,
                "score": score,
                "reasons": reasons,
            })

        time.sleep(0.35)

    writers = [p for p in profiles if p.get("found") and p.get("score", 0) >= args.threshold]
    writers_sorted = sorted(writers, key=lambda x: x.get("score", 0), reverse=True)

    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(
            {
                "input_count": len(handles),
                "threshold": args.threshold,
                "writer_count": len(writers_sorted),
                "writers": writers_sorted,
                "all_profiles": profiles,
            },
            f,
            indent=2,
        )

    with open(args.out_txt, "w", encoding="utf-8") as f:
        for p in writers_sorted:
            f.write(p["handle"] + "\n")

    print(f"Scanned {len(handles)} handles")
    print(f"Writers: {len(writers_sorted)}")
    print(f"Saved JSON: {args.out_json}")
    print(f"Saved TXT:  {args.out_txt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
