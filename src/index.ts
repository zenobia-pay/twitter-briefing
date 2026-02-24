import { Hono } from "hono";
import { html, raw } from "hono/html";

type Bindings = {
  BRIEFING: KVNamespace;
};

interface TweetPost {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  likes: number;
  retweets: number;
  replies: number;
  views?: number;
  whyInteresting: string;
  url: string;
}

interface AccountToFollow {
  handle: string;
  name: string;
  bio: string;
  followers: number;
  following: number;
  avatar?: string;
  whyFollow: string;
  url: string;
}

interface BriefingData {
  date: string;
  scrapedAt: string;
  posts: TweetPost[];
  accountsToFollow: AccountToFollow[];
}

const app = new Hono<{ Bindings: Bindings }>();

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage(data: BriefingData) {
  const dateDisplay = formatDate(data.date);
  const timeDisplay = formatTime(data.scrapedAt);

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily Briefing &mdash; ${dateDisplay}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #faf8f5;
      --bg-card: #f5f1eb;
      --bg-card-hover: #f0ebe3;
      --ink: #2a2522;
      --ink-secondary: #6b5f56;
      --ink-muted: #9c8e83;
      --accent: #c45d3e;
      --accent-light: #e8a590;
      --rule: #d4cbc2;
      --rule-light: #e5ddd5;
    }

    html {
      font-size: 17px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      font-family: 'Outfit', sans-serif;
      font-weight: 400;
      color: var(--ink);
      background: var(--bg);
      line-height: 1.6;
      min-height: 100vh;
    }

    /* Subtle grain texture */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 100;
    }

    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    /* Masthead */
    .masthead {
      text-align: center;
      padding: 2.5rem 0 2rem;
      border-bottom: 3px double var(--rule);
      margin-bottom: 0.5rem;
    }

    .masthead-label {
      font-family: 'Outfit', sans-serif;
      font-weight: 500;
      font-size: 0.65rem;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: var(--ink-muted);
      margin-bottom: 0.5rem;
    }

    .masthead-title {
      font-family: 'Newsreader', serif;
      font-size: 2.8rem;
      font-weight: 400;
      line-height: 1.1;
      color: var(--ink);
      letter-spacing: -0.02em;
    }

    .masthead-date {
      font-family: 'Newsreader', serif;
      font-style: italic;
      font-size: 1rem;
      color: var(--ink-secondary);
      margin-top: 0.6rem;
    }

    .masthead-meta {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
    }

    .masthead-meta span {
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-muted);
    }

    /* Section headers */
    .section-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin: 2.5rem 0 1.5rem;
    }

    .section-header::before,
    .section-header::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--rule);
    }

    .section-label {
      font-family: 'Outfit', sans-serif;
      font-weight: 500;
      font-size: 0.65rem;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: var(--accent);
      white-space: nowrap;
    }

    .section-count {
      font-family: 'Newsreader', serif;
      font-style: italic;
      font-size: 0.85rem;
      color: var(--ink-muted);
      margin-left: -0.5rem;
    }

    /* Post cards */
    .post-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .post-card {
      background: var(--bg-card);
      padding: 1.5rem;
      border-radius: 2px;
      transition: background 0.2s ease;
      position: relative;
    }

    .post-card:hover {
      background: var(--bg-card-hover);
    }

    .post-card + .post-card {
      border-top: 1px solid var(--rule-light);
    }

    .post-number {
      position: absolute;
      top: 1.5rem;
      left: 1.5rem;
      font-family: 'Newsreader', serif;
      font-size: 2rem;
      font-weight: 300;
      color: var(--rule);
      line-height: 1;
    }

    .post-author {
      padding-left: 2.5rem;
      margin-bottom: 0.75rem;
    }

    .post-author-name {
      font-family: 'Newsreader', serif;
      font-weight: 500;
      font-size: 1.05rem;
      color: var(--ink);
    }

    .post-author-handle {
      font-size: 0.8rem;
      color: var(--ink-muted);
      margin-left: 0.4rem;
    }

    .post-text {
      font-family: 'Newsreader', serif;
      font-size: 1.05rem;
      line-height: 1.55;
      color: var(--ink);
      margin-bottom: 1rem;
      padding-left: 2.5rem;
    }

    .post-why {
      font-size: 0.82rem;
      color: var(--accent);
      font-weight: 500;
      margin-bottom: 0.75rem;
      padding-left: 2.5rem;
      line-height: 1.45;
    }

    .post-why::before {
      content: '\2192';
      margin-right: 0.4rem;
      font-weight: 300;
    }

    .post-stats {
      display: flex;
      gap: 1.25rem;
      padding-left: 2.5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .stat {
      font-size: 0.72rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ink-muted);
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .stat-value {
      font-weight: 600;
      color: var(--ink-secondary);
    }

    .post-link {
      margin-left: auto;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--accent);
      text-decoration: none;
      font-weight: 500;
      transition: opacity 0.15s;
    }

    .post-link:hover {
      opacity: 0.7;
    }

    /* Account cards */
    .account-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .account-card {
      background: var(--bg-card);
      padding: 1.5rem;
      border-radius: 2px;
      border-left: 3px solid var(--accent);
      transition: background 0.2s ease;
    }

    .account-card:hover {
      background: var(--bg-card-hover);
    }

    .account-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.6rem;
    }

    .account-name {
      font-family: 'Newsreader', serif;
      font-weight: 500;
      font-size: 1.15rem;
      color: var(--ink);
    }

    .account-handle {
      font-size: 0.8rem;
      color: var(--ink-muted);
      margin-left: 0.4rem;
    }

    .account-follow-link {
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent);
      text-decoration: none;
      font-weight: 500;
      border: 1px solid var(--accent);
      padding: 0.3rem 0.75rem;
      border-radius: 2px;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .account-follow-link:hover {
      background: var(--accent);
      color: var(--bg);
    }

    .account-bio {
      font-family: 'Newsreader', serif;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--ink-secondary);
      margin-bottom: 0.75rem;
    }

    .account-why {
      font-size: 0.82rem;
      color: var(--accent);
      font-weight: 500;
      margin-bottom: 0.6rem;
      line-height: 1.45;
    }

    .account-why::before {
      content: '\2192';
      margin-right: 0.4rem;
      font-weight: 300;
    }

    .account-stats {
      display: flex;
      gap: 1.25rem;
    }

    /* Footer */
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--rule);
      text-align: center;
    }

    .footer-text {
      font-size: 0.7rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--ink-muted);
    }

    .footer-time {
      font-family: 'Newsreader', serif;
      font-style: italic;
      font-size: 0.85rem;
      color: var(--ink-muted);
      margin-top: 0.25rem;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
    }

    .empty-state h2 {
      font-family: 'Newsreader', serif;
      font-weight: 400;
      font-size: 1.5rem;
      color: var(--ink-secondary);
      margin-bottom: 0.5rem;
    }

    .empty-state p {
      font-size: 0.9rem;
      color: var(--ink-muted);
    }

    /* Animations */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .post-card, .account-card {
      animation: fadeUp 0.4s ease both;
    }

    .post-card:nth-child(1) { animation-delay: 0.05s; }
    .post-card:nth-child(2) { animation-delay: 0.1s; }
    .post-card:nth-child(3) { animation-delay: 0.15s; }
    .post-card:nth-child(4) { animation-delay: 0.2s; }
    .post-card:nth-child(5) { animation-delay: 0.25s; }
    .post-card:nth-child(6) { animation-delay: 0.3s; }

    .account-card:nth-child(1) { animation-delay: 0.35s; }
    .account-card:nth-child(2) { animation-delay: 0.4s; }

    /* Mobile */
    @media (max-width: 600px) {
      html { font-size: 15px; }
      .container { padding: 1rem 1rem 3rem; }
      .masthead { padding: 1.5rem 0 1.5rem; }
      .masthead-title { font-size: 2rem; }
      .post-card { padding: 1.25rem 1rem; }
      .post-number { position: static; margin-bottom: 0.5rem; font-size: 1.5rem; }
      .post-author, .post-text, .post-why, .post-stats { padding-left: 0; }
      .account-card { padding: 1.25rem 1rem; }
      .masthead-meta { flex-direction: column; gap: 0.25rem; align-items: center; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="masthead">
      <div class="masthead-label">Your Daily</div>
      <h1 class="masthead-title">Twitter Briefing</h1>
      <div class="masthead-date">${dateDisplay}</div>
      <div class="masthead-meta">
        <span>${data.posts.length} Posts</span>
        <span>${data.accountsToFollow.length} Accounts</span>
      </div>
    </header>

    <div class="section-header">
      <span class="section-label">Posts to Reply To</span>
    </div>

    <div class="post-list">
      ${raw(
        data.posts
          .map(
            (post, i) => `
        <div class="post-card">
          <div class="post-number">${String(i + 1).padStart(2, "0")}</div>
          <div class="post-author">
            <span class="post-author-name">${escapeHtml(post.authorName)}</span>
            <span class="post-author-handle">@${escapeHtml(post.authorHandle)}</span>
          </div>
          <div class="post-text">${escapeHtml(post.text)}</div>
          <div class="post-why">${escapeHtml(post.whyInteresting)}</div>
          <div class="post-stats">
            <span class="stat"><span class="stat-value">${formatNumber(post.likes)}</span> likes</span>
            <span class="stat"><span class="stat-value">${formatNumber(post.retweets)}</span> retweets</span>
            <span class="stat"><span class="stat-value">${formatNumber(post.replies)}</span> replies</span>
            ${post.views ? `<span class="stat"><span class="stat-value">${formatNumber(post.views)}</span> views</span>` : ""}
            <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener" class="post-link">View &rarr;</a>
          </div>
        </div>
      `
          )
          .join("")
      )}
    </div>

    <div class="section-header">
      <span class="section-label">Accounts to Follow</span>
    </div>

    <div class="account-list">
      ${raw(
        data.accountsToFollow
          .map(
            (acct) => `
        <div class="account-card">
          <div class="account-header">
            <div>
              <span class="account-name">${escapeHtml(acct.name)}</span>
              <span class="account-handle">@${escapeHtml(acct.handle)}</span>
            </div>
            <a href="${escapeHtml(acct.url)}" target="_blank" rel="noopener" class="account-follow-link">Follow</a>
          </div>
          <div class="account-bio">${escapeHtml(acct.bio)}</div>
          <div class="account-why">${escapeHtml(acct.whyFollow)}</div>
          <div class="account-stats">
            <span class="stat"><span class="stat-value">${formatNumber(acct.followers)}</span> followers</span>
            <span class="stat"><span class="stat-value">${formatNumber(acct.following)}</span> following</span>
          </div>
        </div>
      `
          )
          .join("")
      )}
    </div>

    <footer class="footer">
      <div class="footer-text">Last Updated</div>
      <div class="footer-time">${timeDisplay}</div>
    </footer>
  </div>
</body>
</html>`;
}

function renderEmpty() {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Twitter Briefing</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Outfit:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: 'Outfit', sans-serif;
      background: #faf8f5;
      color: #2a2522;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .empty-state {
      text-align: center;
      padding: 2rem;
    }
    .empty-state h1 {
      font-family: 'Newsreader', serif;
      font-weight: 400;
      font-size: 2rem;
      margin-bottom: 0.75rem;
    }
    .empty-state p {
      color: #6b5f56;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .empty-state code {
      background: #f0ebe3;
      padding: 0.15rem 0.4rem;
      border-radius: 2px;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="empty-state">
    <h1>No briefing yet</h1>
    <p>Run <code>npm run scrape</code> then <code>npm run push</code> to generate your first briefing.</p>
  </div>
</body>
</html>`;
}

app.get("/", async (c) => {
  const raw = await c.env.BRIEFING.get("latest");
  if (!raw) {
    return c.html(renderEmpty());
  }
  const data: BriefingData = JSON.parse(raw);
  return c.html(renderPage(data));
});

app.get("/api/briefing", async (c) => {
  const raw = await c.env.BRIEFING.get("latest");
  if (!raw) {
    return c.json({ error: "No briefing data" }, 404);
  }
  return c.json(JSON.parse(raw));
});

export default app;
