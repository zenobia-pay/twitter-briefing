// Twitter Briefing Scraper
// Uses Browser Use Cloud API to gather posts and accounts from X/SuperGrok.

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_KEY = process.env.BROWSER_USE_API_KEY;
if (!API_KEY) {
  console.error("Missing BROWSER_USE_API_KEY environment variable.");
  process.exit(1);
}

const BASE = "https://api.browser-use.com/api/v2";
const PROFILE_ID = process.env.BROWSER_USE_PROFILE_ID;

const SEARCH_QUERIES = [
  "new accounts to follow that the accounts i follow follow",
  "new tweets by yc founders",
];

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface Methodology {
  searches: string[];
  plainEnglish: string;
}

interface BriefingData {
  date: string;
  scrapedAt: string;
  posts: BriefingPost[];
  accountsToFollow: AccountToFollow[];
  methodology: Methodology;
}

// ─── Browser Use helpers ─────────────────────────────────────────────────────

async function createSession(profileId?: string): Promise<string | null> {
  if (!profileId) return null;
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Browser-Use-API-Key": API_KEY!,
    },
    body: JSON.stringify({
      profileId,
      persistMemory: true,
      keepAlive: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session (${res.status}): ${text}`);
  }
  const body = (await res.json()) as any;
  return body.id as string;
}

async function createTask(prompt: string, sessionId?: string | null): Promise<string> {
  const res = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Browser-Use-API-Key": API_KEY!,
    },
    body: JSON.stringify({
      task: prompt,
      ...(sessionId ? { sessionId } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create task (${res.status}): ${text}`);
  }
  const body = await res.json() as any;
  return body.id;
}

interface TaskStatus {
  status: string;
  output?: string;
}

async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const res = await fetch(`${BASE}/tasks/${taskId}/status`, {
    headers: { "X-Browser-Use-API-Key": API_KEY! },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get task status (${res.status}): ${text}`);
  }
  return (await res.json()) as TaskStatus;
}

async function pollUntilDone(
  taskId: string,
  intervalMs = 10_000,
  maxWaitMs = 600_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await getTaskStatus(taskId);
    console.log(`  Task ${taskId} status: ${status.status}`);

    if (status.status === "finished" || status.status === "stopped") {
      return status.output ?? "";
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Task ${taskId} timed out after ${maxWaitMs / 1000}s`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Twitter Briefing Scraper (Browser Use) ===\n");

  const prompt = `You are a research assistant. Do the following on X (twitter.com) and SuperGrok:

1. Search X/SuperGrok for: "${SEARCH_QUERIES[0]}"
   - From the results, find 3 interesting accounts to potentially follow.

2. Search X/SuperGrok for: "${SEARCH_QUERIES[1]}"
   - From the results, find 10 interesting recent tweets worth replying to.

Return your results as STRICT JSON (no markdown fences, no extra text) with this exact shape:

{
  "posts": [
    {
      "id": "<tweet id or empty string>",
      "text": "<full tweet text>",
      "authorName": "<display name>",
      "authorHandle": "<handle without @>",
      "likes": <number>,
      "retweets": <number>,
      "replies": <number>,
      "views": <number or 0>,
      "whyInteresting": "<1-sentence reason>",
      "url": "<full tweet URL>"
    }
  ],
  "accountsToFollow": [
    {
      "handle": "<handle without @>",
      "name": "<display name>",
      "bio": "<short bio>",
      "followers": <number>,
      "following": <number>,
      "whyFollow": "<1-sentence reason>",
      "url": "<profile URL>"
    }
  ],
  "methodology": {
    "searches": ${JSON.stringify(SEARCH_QUERIES)},
    "plainEnglish": "Searched X and SuperGrok for new accounts followed by mutual connections, and recent tweets by YC founders. Selected 10 posts with high engagement or good reply opportunities, and 3 accounts with relevant overlap."
  }
}

posts must have exactly 10 items. accountsToFollow must have exactly 3 items. All number fields must be integers (use 0 if unknown). Return ONLY the JSON object, nothing else.`;

  let sessionId: string | null = null;
  if (PROFILE_ID) {
    console.log(`Creating Browser Use session with profile ${PROFILE_ID}...`);
    sessionId = await createSession(PROFILE_ID);
    console.log(`  Session created: ${sessionId}`);
  }

  console.log("Creating Browser Use task...");
  const taskId = await createTask(prompt, sessionId);
  console.log(`  Task created: ${taskId}`);

  console.log("Polling for completion...");
  const output = await pollUntilDone(taskId);

  console.log("\nParsing output...");

  // Extract JSON from the output — the agent may wrap it in markdown fences
  let jsonStr = output;
  const fenceMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }
  // Also try to find a raw JSON object
  if (!jsonStr.startsWith("{")) {
    const objMatch = output.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("Failed to parse JSON from Browser Use output.");
    console.error("Raw output (first 2000 chars):", output.slice(0, 2000));
    process.exit(1);
  }

  // Validate & build briefing
  const posts: BriefingPost[] = (parsed.posts || []).slice(0, 10).map((p: any) => ({
    id: String(p.id || ""),
    text: String(p.text || "").slice(0, 500),
    authorName: String(p.authorName || "Unknown"),
    authorHandle: String(p.authorHandle || "unknown"),
    likes: Number(p.likes) || 0,
    retweets: Number(p.retweets) || 0,
    replies: Number(p.replies) || 0,
    views: Number(p.views) || 0,
    whyInteresting: String(p.whyInteresting || "General interest"),
    url: String(p.url || ""),
  }));

  const accountsToFollow: AccountToFollow[] = (parsed.accountsToFollow || []).slice(0, 3).map((a: any) => ({
    handle: String(a.handle || "unknown"),
    name: String(a.name || "Unknown"),
    bio: String(a.bio || "").slice(0, 280),
    followers: Number(a.followers) || 0,
    following: Number(a.following) || 0,
    whyFollow: String(a.whyFollow || ""),
    url: String(a.url || ""),
  }));

  const methodology: Methodology = {
    searches: parsed.methodology?.searches || SEARCH_QUERIES,
    plainEnglish: String(
      parsed.methodology?.plainEnglish ||
        "Searched X and SuperGrok for new accounts and YC founder tweets.",
    ),
  };

  const briefing: BriefingData = {
    date: new Date().toISOString().split("T")[0],
    scrapedAt: new Date().toISOString(),
    posts,
    accountsToFollow,
    methodology,
  };

  const outPath = join(__dirname, "briefing.json");
  writeFileSync(outPath, JSON.stringify(briefing, null, 2));
  console.log(`\nBriefing saved to ${outPath}`);
  console.log(`  ${posts.length} posts, ${accountsToFollow.length} accounts`);
}

main();
