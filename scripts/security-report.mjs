#!/usr/bin/env node
// Aggregate every repo's security posture into one weekly Markdown report and
// commit it to smart-pet-docs/security/<ISO-year>-W<week>.md. Phase 18, Part C C3.
//
// Sources (all free on public repos): code-scanning alerts, Dependabot alerts,
// secret-scanning alerts — via `gh api`. AWS Security Hub is folded in once the
// account is live; the Slack summary once a webhook secret exists.
//
// Requires: `gh` authenticated (GH_TOKEN) with a token that can read security
// alerts on every repo below and push to smart-pet-docs. Node >=18.
//
// Usage: node scripts/security-report.mjs --docs <path-to-smart-pet-docs> [--dry-run]

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OWNER = 'jubasjl76-eng';
const REPOS = [
  'smart-pet-backend', 'backoffice-dashboard', 'smart-pet-website', 'smart-pet-app',
  'pet-iot-camera-service', 'pet-iot-edge-gateway', 'pet-iot-sensors-service',
  'smart-pet-mqtt', 'smart-pet-api-client', 'smart-pet-shared', 'smart-pet-simulator',
  'smart-pet-device-sdk', 'smart-feeder', 'smart-water-dispenser', 'gps-dog-collar',
  'smart-pet-terraform', 'smart-pet-ci', 'smart-pet-docs',
];
// SLA (Part C C4): fix Critical within 7d, High within 30d.
const SLA_DAYS = { critical: 7, high: 30 };

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const docsDir = args[args.indexOf('--docs') + 1];
if (!docsDir || docsDir.startsWith('--')) { console.error('--docs <dir> is required'); process.exit(2); }

const gh = (path) => {
  try {
    const out = execFileSync('gh', ['api', path, '--paginate', '--slurp'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20,
    });
    return JSON.parse(out).flat();
  } catch (e) {
    const msg = String(e.stderr || e.message);
    if (/\b(403|404)\b/.test(msg)) return { error: msg.match(/\b(403|404)\b/)[1] };
    return { error: msg.split('\n')[0].slice(0, 80) };
  }
};

const ageDays = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400e3);

const rows = [];
const totals = { crit: 0, high: 0, med: 0, low: 0, dep: 0, sec: 0 };
const slaBreaches = [];

for (const repo of REPOS) {
  const cs = gh(`repos/${OWNER}/${repo}/code-scanning/alerts?state=open&per_page=100`);
  const dep = gh(`repos/${OWNER}/${repo}/dependabot/alerts?state=open&per_page=100`);
  const sec = gh(`repos/${OWNER}/${repo}/secret-scanning/alerts?state=open&per_page=100`);

  const csErr = !Array.isArray(cs);
  const bucket = { critical: 0, high: 0, medium: 0, low: 0 };
  if (!csErr) {
    for (const a of cs) {
      const lvl = a.rule?.security_severity_level || a.rule?.severity || 'low';
      if (bucket[lvl] !== undefined) bucket[lvl]++;
      if ((lvl === 'critical' || lvl === 'high') && a.created_at) {
        const d = ageDays(a.created_at);
        if (d > SLA_DAYS[lvl]) {
          slaBreaches.push({ repo, rule: a.rule?.id || a.rule?.name || '?', lvl, days: d, url: a.html_url });
        }
      }
    }
  }
  // Dependabot buckets by advisory severity; count crit+high toward the CS totals view separately.
  const depCount = Array.isArray(dep) ? dep.length : null;
  const secCount = Array.isArray(sec) ? sec.length : null;

  totals.crit += bucket.critical; totals.high += bucket.high;
  totals.med += bucket.medium; totals.low += bucket.low;
  if (depCount) totals.dep += depCount;
  if (secCount) totals.sec += secCount;

  rows.push({
    repo,
    cs: csErr ? '—' : `${bucket.critical} / ${bucket.high} / ${bucket.medium} / ${bucket.low}`,
    dep: depCount === null ? '—' : String(depCount),
    sec: secCount === null ? '—' : String(secCount),
  });
}

// --- week-over-week delta: parse the machine-readable line from the newest prior report ---
const secDir = join(docsDir, 'security');
mkdirSync(secDir, { recursive: true });
const week = (() => {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const w = 1 + Math.round(((d - firstThu) / 86400e3 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
})();
const outFile = join(secDir, `${week}.md`);

let prev = null;
const priors = readdirSync(secDir).filter((f) => /^\d{4}-W\d{2}\.md$/.test(f) && f !== `${week}.md`).sort();
if (priors.length) {
  const m = readFileSync(join(secDir, priors.at(-1)), 'utf8').match(/<!-- totals (.+?) -->/);
  if (m) prev = Object.fromEntries(m[1].trim().split(/\s+/).map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; }));
}
const delta = (k) => prev ? (() => { const d = totals[k] - (prev[k] ?? 0); return d === 0 ? '±0' : (d > 0 ? `+${d}` : String(d)); })() : 'n/a';

// --- render ---
const now = new Date().toISOString().replace(/:\d\d\.\d+Z$/, 'Z');
let md = `# Security report — ${week}\n\n`;
md += `_Generated ${now} by \`smart-pet-ci/scripts/security-report.mjs\`. Code-scanning columns are **critical / high / medium / low** open alerts._\n\n`;
md += `<!-- totals crit=${totals.crit} high=${totals.high} med=${totals.med} low=${totals.low} dep=${totals.dep} sec=${totals.sec} -->\n\n`;
md += `## Org totals\n\n`;
md += `| Metric | Open | Δ vs last report |\n|---|---:|---:|\n`;
md += `| Code-scanning critical | ${totals.crit} | ${delta('crit')} |\n`;
md += `| Code-scanning high | ${totals.high} | ${delta('high')} |\n`;
md += `| Code-scanning medium | ${totals.med} | ${delta('med')} |\n`;
md += `| Code-scanning low | ${totals.low} | ${delta('low')} |\n`;
md += `| Dependabot alerts | ${totals.dep} | ${delta('dep')} |\n`;
md += `| Secret-scanning alerts | ${totals.sec} | ${delta('sec')} |\n\n`;

md += `## SLA breaches (Part C C4 — Critical > 7d, High > 30d)\n\n`;
if (!slaBreaches.length) {
  md += `None. ✅\n\n`;
} else {
  md += `| Repo | Rule | Severity | Age (days) |\n|---|---|---|---:|\n`;
  for (const b of slaBreaches.sort((a, z) => z.days - a.days)) {
    md += `| ${b.repo} | [${b.rule}](${b.url}) | ${b.lvl} | ${b.days} |\n`;
  }
  md += `\n`;
}

md += `## By repo\n\n`;
md += `| Repo | CS (c/h/m/l) | Dependabot | Secrets |\n|---|---|---:|---:|\n`;
for (const r of rows) md += `| ${r.repo} | ${r.cs} | ${r.dep} | ${r.sec} |\n`;
md += `\n_“—” = the API returned 403/404 for that alert type (feature off, or the token lacks \`security_events\`)._\n\n`;

md += `## Not yet covered\n\n`;
md += `- **AWS Security Hub / GuardDuty / IAM Access Analyzer** — folded in once the AWS account is live (\`OPERATOR-ACTIONS.md\` B).\n`;
md += `- **Slack/Discord summary** — needs a webhook secret.\n`;
md += `- Accepted risks live in [\`exceptions.md\`](exceptions.md).\n`;

writeFileSync(outFile, md);
console.log(`wrote ${outFile}`);
console.log(md.split('\n').slice(0, 20).join('\n'));

if (dryRun) { console.log('\n--dry-run: not committing'); process.exit(0); }

const git = (...a) => execFileSync('git', ['-C', docsDir, ...a], { stdio: 'inherit' });
git('add', `security/${week}.md`);
try {
  execFileSync('git', ['-C', docsDir, 'diff', '--cached', '--quiet']);
  console.log('no change — nothing to commit');
} catch {
  git('-c', 'user.name=smart-pet-ci', '-c', 'user.email=ci@smart-pet.invalid',
    'commit', '-m', `security: weekly report ${week}`);
  git('push');
}
