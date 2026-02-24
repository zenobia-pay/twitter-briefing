import { chromium, type Page, type Browser } from "playwright";
import { writeFileSync } from "fs";
import { join } from "path";

const CHROME_PROFILE_PATH =
  process.env.CHROME_PROFILE ||
  `${process.env.HOME}/Library/Application Support/Google/Chrome`;

const TOPICS_OF_INTEREST = [
  "crypto",
  "bitcoin",
  "ethereum",
  "defi",
  "web3",
  "ai",
  "artificial intelligence",
  "llm",
  "gpt",
  "claude",
  "machine learning",
  "startup",
  "founder",
  "yc",
  "venture",
  "vc",
  "fundrais",
  "series a",
  "seed round",
  "tech",
  "engineer",
  "programming",
  "developer",
  "open source",
  "shipping",
  "build",
];

interface ScrapedTweet {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  url: string;
}

interface BriefingPost {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  whyInteresting: string;
  url: string;
}

interface AccountToFollow {
  handle: string;
  name: string;
  bio: string;
  followers: number;
  following: number;
  whyFollow: string;
  url: string;
}

interface BriefingData {
  date: string;
  scrapedAt: string;
  posts: BriefingPost[];
  accountsToFollow: AccountToFollow[];
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCount(text: string | null): number {
  if (!text) return 0;
  const cleaned = text.trim().replace(/,/g, "");
  const match = cleaned.match(/([\d.]+)\s*([KMB]?)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === "K") return Math.round(num * 1_000);
  if (suffix === "M") return Math.round(num * 1_000_000);
  if (suffix === "B") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function topicScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const topic of TOPICS_OF_INTEREST) {
    if (lower.includes(topic)) score++;
  }
  return score;
}

function isReplyOpportunity(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    text.includes("?") ||
    lower.includes("hot take") ||
    lower.includes("unpopular opinion") ||
    lower.includes("what do you think") ||
    lower.includes("thoughts?") ||
    lower.includes("debate") ||
    lower.includes("disagree") ||
    lower.includes("controversial") ||
    lower.includes("thread") ||
    lower.includes("what's your") ||
    lower.includes("who else") ||
    lower.includes("am i wrong")
  );
}

function scoreTweet(tweet: ScrapedTweet): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Engagement score
  const engagement = tweet.likes + tweet.retweets * 2 + tweet.replies * 3;
  if (engagement > 1000) {
    score += 3;
    reasons.push("High engagement");
  } else if (engagement > 200) {
    score += 2;
    reasons.push("Strong engagement");
  } else if (engagement > 50) {
    score += 1;
  }

  // Topic relevance
  const topics = topicScore(tweet.text);
  if (topics >= 2) {
    score += 3;
    reasons.push("Highly relevant topics");
  } else if (topics >= 1) {
    score += 2;
    reasons.push("Relevant topic");
  }

  // Reply opportunity
  if (isReplyOpportunity(tweet.text)) {
    score += 2;
    reasons.push("Good reply opportunity");
  }

  // Discussion threads (high reply count relative to likes)
  if (tweet.replies > 0 && tweet.likes > 0) {
    const replyRatio = tweet.replies / tweet.likes;
    if (replyRatio > 0.3) {
      score += 1;
      reasons.push("Active discussion");
    }
  }

  const reason = reasons.length > 0 ? reasons.join(" \u00B7 ") : "General interest";
  return { score, reason };
}

async function scrapeFeed(page: Page): Promise<ScrapedTweet[]> {
  console.log("Navigating to Twitter home feed...");
  await page.goto("https://x.com/home", { waitUntil: "networkidle", timeout: 30000 });
  await sleep(3000);

  // Scroll to load more tweets
  const tweets: ScrapedTweet[] = [];
  const seenIds = new Set<string>();

  for (let scroll = 0; scroll < 5; scroll++) {
    console.log(`Scroll pass ${scroll + 1}/5...`);

    const articles = await page.$$('article[data-testid="tweet"]');
    for (const article of articles) {
      try {
        // Extract tweet link for ID
        const linkEl = await article.$('a[href*="/status/"]');
        const href = linkEl ? await linkEl.getAttribute("href") : null;
        if (!href) continue;

        const idMatch = href.match(/\/status\/(\d+)/);
        if (!idMatch) continue;
        const id = idMatch[1];
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        // Author info
        const userLink = await article.$('div[data-testid="User-Name"] a');
        const authorHandle =
          (userLink ? await userLink.getAttribute("href") : "")
            ?.replace("/", "") || "unknown";

        const nameSpans = await article.$$('div[data-testid="User-Name"] span');
        let authorName = "Unknown";
        for (const span of nameSpans) {
          const text = await span.innerText().catch(() => "");
          if (text && !text.startsWith("@") && text.length > 1) {
            authorName = text;
            break;
          }
        }

        // Tweet text
        const textEl = await article.$('div[data-testid="tweetText"]');
        const text = textEl ? await textEl.innerText() : "";
        if (!text) continue;

        // Stats
        const likeBtn = await article.$('button[data-testid="like"] span, button[data-testid="unlike"] span');
        const rtBtn = await article.$('button[data-testid="retweet"] span, button[data-testid="unretweet"] span');
        const replyBtn = await article.$('button[data-testid="reply"] span');

        const likes = parseCount(likeBtn ? await likeBtn.innerText().catch(() => "0") : "0");
        const retweets = parseCount(rtBtn ? await rtBtn.innerText().catch(() => "0") : "0");
        const replies = parseCount(replyBtn ? await replyBtn.innerText().catch(() => "0") : "0");

        // Views from analytics link
        const analyticsEl = await article.$('a[href*="/analytics"] span');
        const views = parseCount(analyticsEl ? await analyticsEl.innerText().catch(() => "0") : "0");

        tweets.push({
          id,
          text: text.slice(0, 500),
          authorName,
          authorHandle,
          likes,
          retweets,
          replies,
          views,
          url: `https://x.com${href}`,
        });
      } catch {
        // Skip malformed tweets
      }
    }

    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await sleep(2000);
  }

  console.log(`Scraped ${tweets.length} tweets from feed`);
  return tweets;
}

async function scrapeNotifications(page: Page): Promise<ScrapedTweet[]> {
  console.log("Navigating to notifications...");
  await page.goto("https://x.com/notifications", { waitUntil: "networkidle", timeout: 30000 });
  await sleep(3000);

  const tweets: ScrapedTweet[] = [];
  const seenIds = new Set<string>();

  for (let scroll = 0; scroll < 3; scroll++) {
    console.log(`Notification scroll ${scroll + 1}/3...`);
    const articles = await page.$$('article[data-testid="tweet"]');

    for (const article of articles) {
      try {
        const linkEl = await article.$('a[href*="/status/"]');
        const href = linkEl ? await linkEl.getAttribute("href") : null;
        if (!href) continue;

        const idMatch = href.match(/\/status\/(\d+)/);
        if (!idMatch) continue;
        const id = idMatch[1];
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const userLink = await article.$('div[data-testid="User-Name"] a');
        const authorHandle =
          (userLink ? await userLink.getAttribute("href") : "")
            ?.replace("/", "") || "unknown";

        const nameSpans = await article.$$('div[data-testid="User-Name"] span');
        let authorName = "Unknown";
        for (const span of nameSpans) {
          const text = await span.innerText().catch(() => "");
          if (text && !text.startsWith("@") && text.length > 1) {
            authorName = text;
            break;
          }
        }

        const textEl = await article.$('div[data-testid="tweetText"]');
        const text = textEl ? await textEl.innerText() : "";
        if (!text) continue;

        const likeBtn = await article.$('button[data-testid="like"] span, button[data-testid="unlike"] span');
        const rtBtn = await article.$('button[data-testid="retweet"] span, button[data-testid="unretweet"] span');
        const replyBtn = await article.$('button[data-testid="reply"] span');

        const likes = parseCount(likeBtn ? await likeBtn.innerText().catch(() => "0") : "0");
        const retweets = parseCount(rtBtn ? await rtBtn.innerText().catch(() => "0") : "0");
        const replies = parseCount(replyBtn ? await replyBtn.innerText().catch(() => "0") : "0");

        const analyticsEl = await article.$('a[href*="/analytics"] span');
        const views = parseCount(analyticsEl ? await analyticsEl.innerText().catch(() => "0") : "0");

        tweets.push({
          id,
          text: text.slice(0, 500),
          authorName,
          authorHandle,
          likes,
          retweets,
          replies,
          views,
          url: `https://x.com${href}`,
        });
      } catch {
        // Skip
      }
    }

    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await sleep(2000);
  }

  console.log(`Scraped ${tweets.length} tweets from notifications`);
  return tweets;
}

async function discoverAccounts(page: Page): Promise<AccountToFollow[]> {
  console.log("Looking for suggested accounts...");
  await page.goto("https://x.com/i/connect_people", { waitUntil: "networkidle", timeout: 30000 });
  await sleep(3000);

  const accounts: AccountToFollow[] = [];

  const cells = await page.$$('div[data-testid="UserCell"]');
  for (const cell of cells.slice(0, 10)) {
    try {
      const link = await cell.$("a[href^='/']");
      const href = link ? await link.getAttribute("href") : null;
      if (!href || href === "/") continue;
      const handle = href.replace("/", "");

      const nameEl = await cell.$('div[dir="ltr"] > span');
      const name = nameEl ? await nameEl.innerText() : handle;

      const bioEl = await cell.$('div[data-testid="UserDescription"]');
      const bio = bioEl ? await bioEl.innerText() : "";

      // Check if this person is relevant
      const bioTopics = topicScore(bio + " " + name);
      if (bioTopics === 0) continue;

      // Visit profile for follower count
      await page.goto(`https://x.com/${handle}`, { waitUntil: "networkidle", timeout: 15000 });
      await sleep(1500);

      let followers = 0;
      let following = 0;
      try {
        const followersLink = await page.$(`a[href="/${handle}/verified_followers"]`);
        const followersText = followersLink ? await followersLink.innerText() : "0";
        followers = parseCount(followersText);

        const followingLink = await page.$(`a[href="/${handle}/following"]`);
        const followingText = followingLink ? await followingLink.innerText() : "0";
        following = parseCount(followingText);
      } catch {
        // Fallback
      }

      const reasons: string[] = [];
      if (bioTopics >= 2) reasons.push("Multiple relevant interests");
      else if (bioTopics >= 1) reasons.push("Relevant to your interests");
      if (followers > 10000) reasons.push("Established voice");
      if (followers > 0 && following > 0 && following / followers < 0.5) reasons.push("Good signal-to-noise");

      accounts.push({
        handle,
        name,
        bio: bio.slice(0, 280),
        followers,
        following,
        whyFollow: reasons.join(" \u00B7 ") || "Suggested by Twitter",
        url: `https://x.com/${handle}`,
      });

      // Go back to suggestions
      await page.goto("https://x.com/i/connect_people", { waitUntil: "networkidle", timeout: 15000 });
      await sleep(1000);

      if (accounts.length >= 2) break;
    } catch {
      // Skip
    }
  }

  console.log(`Found ${accounts.length} accounts to follow`);
  return accounts;
}

async function main() {
  console.log("Launching browser with Chrome profile...");

  let browser: Browser;
  try {
    browser = await chromium.launchPersistentContext(CHROME_PROFILE_PATH, {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
      viewport: { width: 1280, height: 900 },
    }).then((ctx) => ctx.browser()!);
  } catch (err) {
    console.error("Failed to launch with Chrome profile. Make sure Chrome is closed first.");
    console.error(err);
    process.exit(1);
  }

  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  try {
    // Scrape feed
    const feedTweets = await scrapeFeed(page);

    // Scrape notifications
    const notifTweets = await scrapeNotifications(page);

    // Deduplicate
    const allTweets = new Map<string, ScrapedTweet>();
    for (const t of [...feedTweets, ...notifTweets]) {
      if (!allTweets.has(t.id)) {
        allTweets.set(t.id, t);
      }
    }

    // Score and rank tweets
    const scored = Array.from(allTweets.values())
      .map((t) => ({ ...t, ...scoreTweet(t) }))
      .sort((a, b) => b.score - a.score);

    // Take top 6
    const topPosts: BriefingPost[] = scored.slice(0, 6).map((t) => ({
      id: t.id,
      text: t.text,
      authorName: t.authorName,
      authorHandle: t.authorHandle,
      likes: t.likes,
      retweets: t.retweets,
      replies: t.replies,
      views: t.views,
      whyInteresting: t.reason,
      url: t.url,
    }));

    // Discover accounts
    const accountsToFollow = await discoverAccounts(page);

    const briefing: BriefingData = {
      date: new Date().toISOString().split("T")[0],
      scrapedAt: new Date().toISOString(),
      posts: topPosts,
      accountsToFollow,
    };

    const outPath = join(import.meta.dirname || __dirname, "briefing.json");
    writeFileSync(outPath, JSON.stringify(briefing, null, 2));
    console.log(`\nBriefing saved to ${outPath}`);
    console.log(`  ${topPosts.length} posts, ${accountsToFollow.length} accounts`);
  } catch (err) {
    console.error("Scrape failed:", err);
  } finally {
    await browser.close();
  }
}

main();
