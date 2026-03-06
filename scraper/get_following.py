#!/usr/bin/env python3
"""
Fetch all accounts a target user is following via Twitter/X API v2.

Usage:
  export TWITTER_BEARER_TOKEN='...'
  python3 scraper/get_following.py --username manabovetown --out scraper/manabovetown-following.json

Notes:
- Requires a v2 bearer token with access to users/following endpoints.
- Paginates until all results are collected.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from typing import Dict, Any, List

API_BASE = "https://api.twitter.com/2"


def api_get(path: str, token: str, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
    qs = ""
    if params:
        qs = "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})

    req = urllib.request.Request(
        API_BASE + path + qs,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "openclaw-twitter-following-script/1.0",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} on {path}: {body}")


def get_user_id(username: str, token: str) -> str:
    r = api_get(f"/users/by/username/{username}", token, params={"user.fields": "id,username,name"})
    data = r.get("data")
    if not data or not data.get("id"):
        raise RuntimeError(f"Could not resolve user id for @{username}. Response: {r}")
    return data["id"]


def get_all_following(user_id: str, token: str, max_results: int = 1000) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    pagination_token = None

    while True:
        params = {
            "max_results": max_results,
            "pagination_token": pagination_token,
            "user.fields": "id,name,username,description,public_metrics,verified,created_at",
        }
        r = api_get(f"/users/{user_id}/following", token, params=params)

        out.extend(r.get("data") or [])

        meta = r.get("meta") or {}
        pagination_token = meta.get("next_token")
        if not pagination_token:
            break

        # Friendly pacing for rate limits
        time.sleep(0.35)

    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--username", required=True, help="Target handle without @")
    p.add_argument("--out", default=None, help="Output JSON path")
    p.add_argument("--token-env", default="TWITTER_BEARER_TOKEN", help="Env var containing bearer token")
    args = p.parse_args()

    token = os.getenv(args.token_env)
    if not token:
        print(f"Missing token env var: {args.token_env}", file=sys.stderr)
        return 1

    username = args.username.lstrip("@")
    user_id = get_user_id(username, token)
    following = get_all_following(user_id, token)

    payload = {
        "target": username,
        "target_user_id": user_id,
        "count": len(following),
        "following": following,
    }

    out_path = args.out or f"scraper/{username}-following.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"Saved {len(following)} followed accounts to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
