# Twitter Operator (Ryan)

Run slots:

```bash
cd ~/.openclaw/workspace/twitter-briefing
export BROWSER_USE_API_KEY='...'

npm run ops:slot -- --slot 6am --niche ai-agent-ops
npm run ops:slot -- --slot 1pm --niche ai-agent-ops
npm run ops:slot -- --slot 4pm --niche ai-agent-ops
npm run ops:slot -- --slot 6pm --niche ai-agent-ops
npm run ops:slot -- --slot 11pm --niche ai-agent-ops
```

Outputs are saved to `ops/runs/YYYY-MM-DD/{slot}.json`.

Suggested cron:
```cron
0 6 * * * cd /Users/ryanprendergast/.openclaw/workspace/twitter-briefing && /usr/bin/python3 ops/twitter_operator.py --slot 6am --niche ai-agent-ops
0 13 * * * cd /Users/ryanprendergast/.openclaw/workspace/twitter-briefing && /usr/bin/python3 ops/twitter_operator.py --slot 1pm --niche ai-agent-ops
0 16 * * * cd /Users/ryanprendergast/.openclaw/workspace/twitter-briefing && /usr/bin/python3 ops/twitter_operator.py --slot 4pm --niche ai-agent-ops
0 18 * * * cd /Users/ryanprendergast/.openclaw/workspace/twitter-briefing && /usr/bin/python3 ops/twitter_operator.py --slot 6pm --niche ai-agent-ops
0 23 * * * cd /Users/ryanprendergast/.openclaw/workspace/twitter-briefing && /usr/bin/python3 ops/twitter_operator.py --slot 11pm --niche ai-agent-ops
```
