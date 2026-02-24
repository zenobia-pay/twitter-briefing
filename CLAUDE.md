# Twitter Briefing Tool

Build a daily social media briefing system with two components:

## 1. Cloudflare Worker (Display Layer)

A Hono-based Worker that displays the daily briefing. Design requirements:
- **LIGHT MODE ONLY** — warm paper tones (#faf8f5), readable contrast
- Clean, minimal design — think morning newspaper briefing
- Shows:
  - 5-6 interesting posts to reply to (with tweet text, author, engagement stats, why it's interesting)
  - 1-2 new accounts to follow (with bio, follower count, why follow)
  - Date/time of last scrape
- Mobile-friendly

Store data in KV namespace "BRIEFING".

## 2. Scraper Script (scraper.ts)

A local Node.js script that:
- Uses Playwright with Chrome profile to access logged-in Twitter
- Scrapes Ryan's Twitter feed and notifications
- Finds interesting posts based on:
  - High engagement relative to author's typical
  - Topics Ryan cares about (crypto, AI, startups, tech)
  - Good reply opportunities (questions, hot takes, discussions)
- Finds new accounts to follow based on:
  - Mutual follows with people Ryan follows
  - Active in relevant spaces
  - Good signal-to-noise ratio
- Saves results to a JSON file (briefing.json)
- Has a separate script to push JSON to Cloudflare KV

## Project Structure

```
twitter-briefing/
├── src/
│   └── index.ts          # Hono Worker
├── scraper/
│   ├── scrape.ts         # Main scraper (Playwright)
│   ├── push-to-kv.ts     # Pushes briefing.json to KV
│   └── briefing.json     # Output from scraper
├── wrangler.toml
├── package.json
└── CLAUDE.md
```

## Stack

- Wrangler + Hono for Worker
- Playwright for browser automation (use existing Chrome profile)
- TypeScript throughout

## Deploy

After building, deploy with `wrangler deploy` and return the live URL.
