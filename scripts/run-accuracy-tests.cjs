/**
 * ROO Accuracy Test Runner v1.0
 *
 * Runs all seeded accuracy test scenarios against the local dev server.
 * Triggers analyze-ai for each case, waits for completion, then checks
 * that the expected grounds are ticked (or not ticked for adversarial cases).
 *
 * Usage: node scripts/run-accuracy-tests.cjs [--only=ACC-R1-001,ACC-R2-001]
 *
 * Prerequisites:
 *   - Local dev server running on http://localhost:3000
 *   - Database seeded: npm run seed:dev
 */

'use strict';

const BASE = 'http://localhost:3000/api/v1';
const EMAIL = 'april.clemente@ymlgroup.com.au';
const PASSWORD = 'Admin@123';

// ─── Helper to detect adversarial "must not tick" instructions ────────────────
function isNegativeTick(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('must not be ticked') ||
    lower.includes('must not tick') ||
    lower.includes('not be ticked') ||
    lower.includes('should not be ticked') ||
    lower.includes('do not tick') ||
    lower.includes('r5 must not') ||
    lower.includes('r9 must not')
  );
}

// ─── All accuracy scenarios (seq → expected ground analysis) ─────────────────
// groundAnalysis: { groundNumber: analysisText }
// Expected tick for each key: true if analysisText is positive, false if adversarial
const SCENARIOS = [
  // ── R1 — Too High ────────────────────────────────────────────────────────────
  { seq: 1,  id: 'ACC-R1-001', groundAnalysis: { '1': 'positive' } },
  { seq: 2,  id: 'ACC-R1-002', groundAnalysis: { '1': 'positive' } },
  { seq: 3,  id: 'ACC-R1-003', groundAnalysis: { '1': 'positive' } },
  { seq: 51, id: 'ACC-R1-004', groundAnalysis: { '1': 'positive' } },
  { seq: 52, id: 'ACC-R1-005', groundAnalysis: { '1': 'positive' } },

  // ── R2 — Too Low ─────────────────────────────────────────────────────────────
  { seq: 4,  id: 'ACC-R2-001', groundAnalysis: { '2': 'positive' } },
  { seq: 5,  id: 'ACC-R2-002', groundAnalysis: { '2': 'positive' } },
  { seq: 57, id: 'ACC-R2-003', groundAnalysis: { '2': 'positive' } },

  // ── R3 — Area Incorrect ───────────────────────────────────────────────────────
  { seq: 7,  id: 'ACC-R3-001', groundAnalysis: { '3': 'positive' } },
  { seq: 8,  id: 'ACC-R3-002', groundAnalysis: { '3': 'positive' } },
  { seq: 53, id: 'ACC-R3-003', groundAnalysis: { '3': 'positive' } },
  { seq: 54, id: 'ACC-R3-004', groundAnalysis: { '3': 'positive' } },

  // ── R4 — Description Incorrect ───────────────────────────────────────────────
  { seq: 9,  id: 'ACC-R4-001', groundAnalysis: { '4': 'positive' } },
  { seq: 10, id: 'ACC-R4-002', groundAnalysis: { '4': 'positive' } },
  { seq: 55, id: 'ACC-R4-003', groundAnalysis: { '4': 'positive' } },

  // ── R5 — Wrong Person (Ground 7) ─────────────────────────────────────────────
  { seq: 11, id: 'ACC-R5-001', groundAnalysis: { '7': 'positive' } },
  { seq: 12, id: 'ACC-R5-002', groundAnalysis: { '7': 'positive' } },
  { seq: 13, id: 'ACC-R5-003', groundAnalysis: { '7': 'positive' } },

  // ── R6 — Apportionment (Ground 8) ────────────────────────────────────────────
  { seq: 14, id: 'ACC-R6-001', groundAnalysis: { '8': 'positive' } },
  { seq: 15, id: 'ACC-R6-002', groundAnalysis: { '8': 'positive' } },
  { seq: 16, id: 'ACC-R6-003', groundAnalysis: { '8': 'positive' } },
  { seq: 17, id: 'ACC-R6-004', groundAnalysis: { '8': 'positive' } },
  { seq: 58, id: 'ACC-R6-005', groundAnalysis: { '8': 'positive' } },

  // ── R7 — With Other Land (Ground 6) ──────────────────────────────────────────
  { seq: 19, id: 'ACC-R7-001', groundAnalysis: { '6': 'positive' } },
  { seq: 20, id: 'ACC-R7-002', groundAnalysis: { '6': 'positive' } },

  // ── R8 — Separately (Ground 5) ───────────────────────────────────────────────
  { seq: 21, id: 'ACC-R8-001', groundAnalysis: { '5': 'positive' } },
  { seq: 22, id: 'ACC-R8-002', groundAnalysis: { '5': 'positive' } },
  { seq: 56, id: 'ACC-R8-003', groundAnalysis: { '8': 'positive' } },  // strata area → Ground 8

  // ── R9 — Concessions ─────────────────────────────────────────────────────────
  { seq: 23, id: 'ACC-R9-001', groundAnalysis: { '9': 'positive' } },
  { seq: 24, id: 'ACC-R9-002', groundAnalysis: { '9': 'positive' } },
  { seq: 25, id: 'ACC-R9-003', groundAnalysis: { '9': 'positive' } },
  { seq: 26, id: 'ACC-R9-004', groundAnalysis: { '9': 'positive' } },
  { seq: 27, id: 'ACC-R9-005', groundAnalysis: { '9': 'positive' } },
  { seq: 28, id: 'ACC-R9-006', groundAnalysis: { '9': 'positive' } },
  { seq: 29, id: 'ACC-R9-007', groundAnalysis: { '9': 'positive' } },
  { seq: 30, id: 'ACC-R9-008', groundAnalysis: { '9': 'positive' } },
  { seq: 33, id: 'ACC-R9-009', groundAnalysis: { '9': 'positive' } },
  { seq: 32, id: 'ACC-R9-010', groundAnalysis: { '9': 'positive' } },
  { seq: 34, id: 'ACC-R9-011', groundAnalysis: { '9': 'positive' } },
  { seq: 35, id: 'ACC-R9-012', groundAnalysis: { '9': 'positive' } },
  { seq: 36, id: 'ACC-R9-013', groundAnalysis: { '9': 'positive' } },
  { seq: 37, id: 'ACC-R9-014', groundAnalysis: { '9': 'positive' } },
  { seq: 31, id: 'ACC-R9-015', groundAnalysis: { '9': 'positive' } },

  // ── ADV — Adversarial ────────────────────────────────────────────────────────
  // ADV-001: Ground 2 ticks, Grounds 7 and 9 must NOT tick
  {
    seq: 38, id: 'ADV-001',
    groundAnalysis: {
      '2': 'positive',
      '7': 'ABR: owner correctly named. No wrong-person issue. R5 must NOT be ticked.',
      '9': 'No concession applies. R9 must NOT be ticked.',
    },
  },
  // ADV-002: Grounds 1 and 9 tick (PPR missing evidence — Ground 9 ticks to discuss issue)
  {
    seq: 39, id: 'ADV-002',
    groundAnalysis: {
      '1': 'positive',
      '9': 'positive',  // PPR flag set but no evidence — Ground 9 ticks to flag missing evidence
    },
  },
  // ADV-003: Ground 8 ticks (conflicting entitlement schedules)
  { seq: 40, id: 'ADV-003', groundAnalysis: { '8': 'positive' } },

  // ── CRX — Cross-Reason ───────────────────────────────────────────────────────
  { seq: 41, id: 'CRX-001', groundAnalysis: { '1': 'positive', '3': 'positive' } },
  {
    seq: 42, id: 'CRX-002',
    groundAnalysis: { '7': 'positive', '8': 'positive' },
    contentChecks: [
      { groundNum: '7', label: 'R5 — ground label explicitly stated', contains: 'R5' },
      { groundNum: '8', label: 'R6 — correct entitlement 1.5% (12 / 800) stated', contains: '800' },
      { groundNum: '8', label: 'R6 — entitlement percentage 1.5% stated', contains: '1.5' },
    ],
  },
  { seq: 43, id: 'CRX-003', groundAnalysis: { '1': 'positive', '4': 'positive' } },

  // ── MIS — Missing Data ───────────────────────────────────────────────────────
  // MIS-001: Ground 1 ticks — land area missing, must request from title/DP
  { seq: 44, id: 'MIS-001', groundAnalysis: { '1': 'positive' } },
  // MIS-002: Ground 9 ticks (but content must flag missing cost)
  { seq: 45, id: 'MIS-002', groundAnalysis: { '9': 'positive' } },
  // MIS-003: Ground 7 ticks (but content must flag missing date of death)
  { seq: 46, id: 'MIS-003', groundAnalysis: { '7': 'positive' } },

  // ── INV — Inverse Concession ─────────────────────────────────────────────────
  { seq: 47, id: 'INV-001', groundAnalysis: { '9': 'positive' } },
  { seq: 48, id: 'INV-002', groundAnalysis: { '9': 'positive' } },

  // ── Edge Cases ───────────────────────────────────────────────────────────────
  { seq: 49, id: 'R1X-001', groundAnalysis: { '1': 'positive' } },
  { seq: 50, id: 'R2X-001', groundAnalysis: { '2': 'positive' } },
];

// ─── Build dispute case UUID from sequence number ────────────────────────────
function caseId(seq) {
  const s = String(seq).padStart(4, '0');
  return `acc00001-${s}-4000-a000-000000000005`;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function apiGet(url, cookie) {
  const res = await fetch(url, {
    headers: cookie ? { Cookie: `access_token=${cookie}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function apiPost(url, body, cookie) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: `access_token=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return { data: await res.json(), headers: res.headers };
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  // Extract cookie
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/access_token=([^;]+)/);
  if (!match) throw new Error('No access_token cookie in login response');
  return match[1];
}

// ─── Trigger analyze-ai and wait for completion ───────────────────────────────
async function runAnalysis(disputeCaseId, cookie) {
  // Enqueue
  try {
    await apiPost(`${BASE}/dispute-cases/${disputeCaseId}/analyze-ai`, {}, cookie);
  } catch (err) {
    // 409 Conflict = already in queue, that's OK for re-runs
    if (!err.message.includes('409')) throw err;
  }

  // Poll until complete (max 3 minutes)
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const status = await apiGet(`${BASE}/dispute-cases/${disputeCaseId}/analyze-ai/status`, cookie);
      if (status.status === 'completed') return;
      if (status.status === 'failed') throw new Error(`Job failed: ${JSON.stringify(status)}`);
    } catch (err) {
      if (err.message.includes('404')) {
        // Job not found yet - might still be queued
        continue;
      }
      throw err;
    }
  }
  throw new Error('Timed out waiting for analyze-ai');
}

// ─── Get objection reasons ────────────────────────────────────────────────────
async function getReasons(disputeCaseId, cookie) {
  return apiGet(`${BASE}/dispute-cases/${disputeCaseId}/objection-reasons`, cookie);
}

// ─── Check results ────────────────────────────────────────────────────────────
function checkScenario(scenario, reasons) {
  const checks = [];
  const groundMap = {};
  for (const r of reasons) {
    groundMap[String(r.ground_number)] = r;
  }

  if (!scenario.groundAnalysis) {
    // No groundAnalysis → expect NO grounds to tick
    const ticked = Object.values(groundMap).filter(r => r.is_tick);
    if (ticked.length === 0) {
      checks.push({ label: 'No grounds ticked (expected)', pass: true });
    } else {
      const tickedNums = ticked.map(r => r.ground_number).join(', ');
      checks.push({ label: `No grounds should tick — but Ground(s) ${tickedNums} ticked`, pass: false });
    }
    return checks;
  }

  for (const [groundNum, analysisText] of Object.entries(scenario.groundAnalysis)) {
    const reason = groundMap[groundNum];
    if (!reason) {
      checks.push({ label: `Ground ${groundNum}: not found in response`, pass: false });
      continue;
    }
    const shouldNotTick = isNegativeTick(analysisText);
    const expectedTick = !shouldNotTick;
    const actualTick = reason.is_tick;
    const pass = actualTick === expectedTick;
    const label = shouldNotTick
      ? `Ground ${groundNum} must NOT tick — is_tick = ${actualTick}`
      : `Ground ${groundNum} should tick — is_tick = ${actualTick}`;
    checks.push({ label, pass });
  }

  // Content checks: verify that reason.analysis contains required strings
  if (scenario.contentChecks) {
    for (const cc of scenario.contentChecks) {
      const reason = groundMap[cc.groundNum];
      if (!reason) {
        checks.push({ label: `Ground ${cc.groundNum} — ${cc.label} (ground not found)`, pass: false });
        continue;
      }
      const analysis = reason.analysis ?? '';
      const pass = analysis.includes(cc.contains);
      checks.push({ label: `Check: ${cc.label}`, pass });
    }
  }

  return checks;
}

// ─── Filter by --only= CLI argument ──────────────────────────────────────────
function filterScenarios(scenarios) {
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  if (!onlyArg) return scenarios;
  const ids = onlyArg.replace('--only=', '').split(',').map(s => s.trim());
  return scenarios.filter(s => ids.includes(s.id));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  ROO Accuracy Test Runner v1.0');
  console.log('════════════════════════════════════════════════════════════════\n');

  const scenarios = filterScenarios(SCENARIOS);
  console.log(`Running ${scenarios.length} scenario(s)...\n`);

  let cookie;
  try {
    cookie = await login();
    console.log(`✓ Logged in as ${EMAIL}\n`);
  } catch (err) {
    console.error(`✗ Login failed: ${err.message}`);
    process.exit(1);
  }

  const results = [];
  let totalChecks = 0, passedChecks = 0;

  for (const scenario of scenarios) {
    const id = caseId(scenario.seq);
    process.stdout.write(`${scenario.id.padEnd(14)} [seq=${String(scenario.seq).padStart(2)}] ... `);

    let status = 'PASS';
    let errorMsg = null;
    let checks = [];

    try {
      await runAnalysis(id, cookie);
      const reasons = await getReasons(id, cookie);
      checks = checkScenario(scenario, reasons);
      const allPass = checks.every(c => c.pass);
      status = allPass ? 'PASS' : 'FAIL';
    } catch (err) {
      status = 'ERROR';
      errorMsg = err.message;
    }

    const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
    console.log(`${icon} ${status}`);

    if (status === 'FAIL') {
      for (const c of checks) {
        if (!c.pass) console.log(`         ↳ FAIL: ${c.label}`);
      }
    }
    if (status === 'ERROR') {
      console.log(`         ↳ ${errorMsg}`);
    }

    for (const c of checks) {
      totalChecks++;
      if (c.pass) passedChecks++;
    }

    results.push({ id: scenario.id, seq: scenario.seq, status, checks, errorMsg });
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errored = results.filter(r => r.status === 'ERROR').length;

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} PASS | ${failed} FAIL | ${errored} ERROR`);
  console.log(`  Checks:  ${passedChecks}/${totalChecks} passed`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED scenarios:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  ${r.id} (seq ${r.seq})`);
      for (const c of r.checks.filter(c => !c.pass)) {
        console.log(`    ↳ ${c.label}`);
      }
    }
    console.log('');
  }

  if (errored > 0) {
    console.log('ERROR scenarios:');
    for (const r of results.filter(r => r.status === 'ERROR')) {
      console.log(`  ${r.id} (seq ${r.seq}): ${r.errorMsg}`);
    }
    console.log('');
  }

  process.exit(failed + errored > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
