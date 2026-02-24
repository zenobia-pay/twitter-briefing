import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const NAMESPACE_ID = "e7bbcf8e214d4586afb9749c4e0dd349";
const ACCOUNT_ID = "0e1651bc459f3017e816ba2263e0807a";

const briefingPath = join(import.meta.dirname || __dirname, "briefing.json");

let data: string;
try {
  data = readFileSync(briefingPath, "utf-8");
} catch {
  console.error(`Could not read ${briefingPath}`);
  console.error("Run 'npm run scrape' first to generate the briefing.");
  process.exit(1);
}

// Validate JSON
try {
  JSON.parse(data);
} catch {
  console.error("briefing.json contains invalid JSON.");
  process.exit(1);
}

console.log("Pushing briefing data to Cloudflare KV...");

// Write to a temp file to avoid shell escaping issues
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";

const tmpFile = join(tmpdir(), "briefing-kv-value.json");
writeFileSync(tmpFile, data);

try {
  execSync(
    `npx wrangler kv key put --namespace-id="${NAMESPACE_ID}" "latest" --path="${tmpFile}"`,
    { stdio: "inherit" }
  );
  console.log("Done! Briefing data pushed to KV key 'latest'.");
} catch (err) {
  console.error("Failed to push to KV:", err);
  process.exit(1);
} finally {
  try {
    unlinkSync(tmpFile);
  } catch {
    // ignore
  }
}
