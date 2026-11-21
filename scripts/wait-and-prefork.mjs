/**
 * Polls until GitHub fork throttle clears, then pre-creates all forks
 * for pending WQ items one at a time with ~10s gaps.
 * Run this before income-agent.mjs when you hit "submitted too quickly".
 */
import { execSync } from "child_process";

// Test repo — if this works, the throttle is clear
const TEST_REPO = "earnestmant2/mysql";

const repos = [
  "earnestmant2/mysql",
  "RoseMark45/echo",
  "jeromyritchie52/Apache-ZooKeeper",
  "raimeecas/mysql",
  "juanitahagenes/ClickHouse",
  "alulaalmi/Apache-APISIX",
  "jaasielitaigq/pgx",
  "victorjones6awpg/Casbin",
  "davontepowlowsk1i/Apache-Pulsar",
  "aozorayama45/Apache-DolphinScheduler",
  "rethavonRueden3/cobra",
  "rethavonRueden3/go-github",
  "MeaganReyesq8/memberlist",
  "davontepowlowsk1i/gofiber-fiber",
  "MariauqmpsA333/go-redis",
  "thaohuynh14zc/urfave-cli",
  "davontepowlowsk1i/CockroachDB",
  "rodrickparker11/TiKV",
];

const ghUser = execSync("gh api user --jq .login").toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tryFork(repo) {
  try {
    execSync(`gh api repos/${repo}/forks -X POST --silent`);
    return true;
  } catch {
    return false;
  }
}

function forkExists(user, repoName) {
  try {
    execSync(`gh api repos/${user}/${repoName} --silent`);
    return true;
  } catch {
    return false;
  }
}

// Phase 1: Wait for throttle to clear by polling the test repo
console.log("Waiting for GitHub fork throttle to clear...");
let attempts = 0;
while (true) {
  const testName = TEST_REPO.split("/")[1];
  if (forkExists(ghUser, testName)) {
    console.log(`  already forked ${TEST_REPO} — throttle check by trying a new repo`);
    break;
  }
  if (tryFork(TEST_REPO)) {
    console.log(`  Throttle cleared! Successfully forked ${TEST_REPO}`);
    break;
  }
  attempts++;
  const wait = Math.min(60, 15 + attempts * 5);
  console.log(`  Still throttled (attempt ${attempts}), waiting ${wait}s...`);
  await sleep(wait * 1000);
}

// Phase 2: Create remaining forks slowly
console.log(`\nCreating forks for ${repos.length} repos...\n`);
let created = 0;
let existed = 0;
let failed = 0;

for (const repo of repos) {
  const forkName = repo.split("/")[1];
  if (forkExists(ghUser, forkName)) {
    console.log(`  ✓ already  ${forkName}`);
    existed++;
    continue;
  }

  let ok = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(30000);
    if (tryFork(repo)) {
      ok = true;
      break;
    }
    console.log(`    throttled on ${repo} (attempt ${attempt + 1})`);
  }

  if (ok) {
    console.log(`  ✓ forked  ${repo}`);
    created++;
    await sleep(10000); // 10s between forks
  } else {
    console.log(`  ✗ FAILED  ${repo}`);
    failed++;
  }
}

console.log(`\nDone: ${created} created, ${existed} already existed, ${failed} failed`);
console.log("Now run: node scripts/income-agent.mjs");
