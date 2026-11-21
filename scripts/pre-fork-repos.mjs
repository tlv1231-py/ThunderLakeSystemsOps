/**
 * Pre-create forks for all pending WQ items, with throttle-aware backoff.
 * Run before the pipeline to avoid "submitted too quickly" GitHub 403s.
 */
import { execSync } from "child_process";

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
console.log(`Forking ${repos.length} repos as ${ghUser}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let created = 0;
let existed = 0;
let failed = 0;

for (let i = 0; i < repos.length; i++) {
  const repo = repos[i];
  const forkName = repo.split("/")[1];

  // Check if already forked
  try {
    execSync(`gh api repos/${ghUser}/${forkName} --silent`);
    console.log(`  ✓ already  ${forkName}`);
    existed++;
    continue;
  } catch {}

  let ok = false;
  for (const delay of [0, 30000, 60000, 120000]) {
    if (delay > 0) {
      console.log(`    retry in ${delay / 1000}s…`);
      await sleep(delay);
    }
    try {
      execSync(`gh api repos/${repo}/forks -X POST --silent`);
      console.log(`  ✓ forked (${i + 1}/${repos.length}) ${repo}`);
      ok = true;
      created++;
      break;
    } catch (e) {
      const msg = String(e.stdout ?? e.message ?? e).slice(0, 80);
      console.log(`  ✗ ${repo}: ${msg}`);
    }
  }
  if (!ok) {
    console.log(`  ✗ FAILED permanently: ${repo}`);
    failed++;
  } else {
    await sleep(5000); // 5s pause between successful forks
  }
}

console.log(`\nDone: ${created} created, ${existed} already existed, ${failed} failed`);
