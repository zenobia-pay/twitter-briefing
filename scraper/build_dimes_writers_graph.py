#!/usr/bin/env python3
"""
Build merged writers-following graph using X API v2.

Schema output (JSONL/JSON):
- nodes.jsonl: account nodes (signals)
- edges.jsonl: src(writer) -> dst(followed) edges (unique per pair)
- node_stats.jsonl: per-node rollups
- top-followed-by-writers.json: sorted leaderboard
- run summary json

Usage:
  set -a && source ~/.openclaw/workspace/twitter-deep-dive/.env && set +a
  python3 scraper/build_dimes_writers_graph.py \
    --writers scraper/manabovetown-writers.json \
    --outdir data/dimes-writers
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

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
            "User-Agent": "openclaw-dimes-writers-graph/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_likely_writers(path: str) -> List[Dict[str, Any]]:
    j = json.load(open(path, "r", encoding="utf-8"))
    rows = j.get("writers") or []
    out = []
    for r in rows:
        h = (r.get("handle") or "").strip()
        if not h:
            continue
        out.append({
            "handle": h if h.startswith("@") else "@" + h,
            "name": r.get("name", ""),
            "bio": r.get("bio", ""),
            "score": int(r.get("score", 0)),
        })
    return out


def batch_get_users_by_usernames(token: str, usernames: List[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for i in range(0, len(usernames), 100):
        chunk = usernames[i:i + 100]
        r = api_get(
            "/users/by",
            token,
            params={
                "usernames": ",".join(chunk),
                "user.fields": "id,name,username,description,url,verified,public_metrics,created_at",
            },
        )
        for u in r.get("data") or []:
            out[(u.get("username") or "").lower()] = u
        time.sleep(0.4)
    return out


def fetch_following_for_user(token: str, user_id: str, max_per_page: int = 1000) -> List[Dict[str, Any]]:
    all_rows: List[Dict[str, Any]] = []
    next_token = None
    while True:
        r = api_get(
            f"/users/{user_id}/following",
            token,
            params={
                "max_results": max_per_page,
                "pagination_token": next_token,
                "user.fields": "id,name,username,description,url,verified,public_metrics,created_at",
            },
        )
        all_rows.extend(r.get("data") or [])
        meta = r.get("meta") or {}
        next_token = meta.get("next_token")
        if not next_token:
            break
        time.sleep(0.35)
    return all_rows


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def write_jsonl(path: Path, rows: List[Dict[str, Any]]):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--writers", required=True, help="Path to manabovetown-writers.json")
    ap.add_argument("--outdir", default="data/dimes-writers")
    ap.add_argument("--token-env", default="TWITTER_BEARER_TOKEN")
    ap.add_argument("--sleep", type=float, default=0.25)
    args = ap.parse_args()

    token = os.getenv(args.token_env)
    if not token:
        raise SystemExit(f"Missing token env var: {args.token_env}")

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    day = dt.datetime.now().strftime("%Y-%m-%d")
    outdir = Path(args.outdir)
    runs_dir = outdir / "runs"
    ensure_dir(outdir)
    ensure_dir(runs_dir)

    writers = load_likely_writers(args.writers)
    writer_usernames = [w["handle"].lstrip("@").lower() for w in writers]

    # Resolve writer profiles to IDs first
    writer_map = batch_get_users_by_usernames(token, writer_usernames)

    nodes: Dict[str, Dict[str, Any]] = {}
    edges: Dict[Tuple[str, str], Dict[str, Any]] = {}
    followed_by_writers: Dict[str, set] = defaultdict(set)
    writer_following_counts: Dict[str, int] = {}
    errors: List[Dict[str, Any]] = []

    # Add writer nodes (seed signals)
    for w in writers:
        uname = w["handle"].lstrip("@").lower()
        u = writer_map.get(uname)
        if not u:
            errors.append({"type": "writer_not_found", "handle": w["handle"]})
            continue
        uid = u["id"]
        nodes[uid] = {
            "id": uid,
            "handle": "@" + u.get("username", uname),
            "name": u.get("name", w.get("name", "")),
            "bio": u.get("description", w.get("bio", "")),
            "is_writer": True,
            "writer_score": int(w.get("score", 0)),
            "first_seen_at": now,
            "last_seen_at": now,
        }

    writer_ids = [uid for uid, n in nodes.items() if n.get("is_writer")]

    # Crawl following for each writer
    for idx, writer_id in enumerate(writer_ids, start=1):
        src = nodes[writer_id]
        try:
            following = fetch_following_for_user(token, writer_id)
        except Exception as e:
            errors.append({"type": "following_fetch_failed", "writer_id": writer_id, "handle": src["handle"], "error": str(e)})
            continue

        writer_following_counts[writer_id] = len(following)

        for dst_u in following:
            dst_id = dst_u["id"]
            # Upsert destination node
            if dst_id not in nodes:
                nodes[dst_id] = {
                    "id": dst_id,
                    "handle": "@" + (dst_u.get("username") or "").strip(),
                    "name": dst_u.get("name", ""),
                    "bio": dst_u.get("description", ""),
                    "is_writer": False,
                    "writer_score": 0,
                    "first_seen_at": now,
                    "last_seen_at": now,
                }
            else:
                nodes[dst_id]["last_seen_at"] = now

            k = (writer_id, dst_id)
            if k not in edges:
                edges[k] = {
                    "src_id": writer_id,
                    "dst_id": dst_id,
                    "first_seen_at": now,
                    "last_seen_at": now,
                    "source_batch": day,
                }
            else:
                edges[k]["last_seen_at"] = now

            followed_by_writers[dst_id].add(writer_id)

        if idx % 5 == 0:
            print(f"Processed {idx}/{len(writer_ids)} writers...")
        time.sleep(args.sleep)

    # Rollups
    node_stats: List[Dict[str, Any]] = []
    for nid, node in nodes.items():
        writers_set = followed_by_writers.get(nid, set())
        node_stats.append({
            "node_id": nid,
            "followed_by_writer_count": len(writers_set),
            "writer_followers": sorted(list(writers_set)),
            "last_recomputed_at": now,
        })

    node_stats_sorted = sorted(node_stats, key=lambda x: x["followed_by_writer_count"], reverse=True)

    top = []
    for s in node_stats_sorted[:1000]:
        if s["followed_by_writer_count"] <= 1:
            continue
        n = nodes[s["node_id"]]
        top.append({
            "node_id": s["node_id"],
            "handle": n.get("handle"),
            "name": n.get("name"),
            "bio": n.get("bio"),
            "followed_by_writer_count": s["followed_by_writer_count"],
            "writer_follower_handles": [nodes[w]["handle"] for w in s["writer_followers"] if w in nodes],
        })

    # Persist
    nodes_rows = list(nodes.values())
    edges_rows = list(edges.values())

    write_jsonl(outdir / "nodes.jsonl", nodes_rows)
    write_jsonl(outdir / "edges.jsonl", edges_rows)
    write_jsonl(outdir / "node_stats.jsonl", node_stats)

    (outdir / "top-followed-by-writers.json").write_text(json.dumps(top, indent=2))

    run_summary = {
        "run_date": day,
        "ran_at": now,
        "input_writers": len(writers),
        "resolved_writers": len(writer_ids),
        "nodes": len(nodes_rows),
        "edges": len(edges_rows),
        "nodes_followed_by_2plus_writers": sum(1 for x in node_stats if x["followed_by_writer_count"] >= 2),
        "errors": errors,
        "writer_following_counts": writer_following_counts,
        "schema": {
            "nodes": ["id", "handle", "name", "bio", "is_writer", "writer_score", "first_seen_at", "last_seen_at"],
            "edges": ["src_id", "dst_id", "first_seen_at", "last_seen_at", "source_batch"],
            "node_stats": ["node_id", "followed_by_writer_count", "writer_followers", "last_recomputed_at"],
        },
    }
    (runs_dir / f"{day}.json").write_text(json.dumps(run_summary, indent=2))

    print(json.dumps({
        "nodes": len(nodes_rows),
        "edges": len(edges_rows),
        "writers_resolved": len(writer_ids),
        "nodes_followed_by_2plus_writers": run_summary["nodes_followed_by_2plus_writers"],
        "errors": len(errors),
        "run_summary": str(runs_dir / f"{day}.json"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
