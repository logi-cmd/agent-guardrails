import { computeCompositeScore, getScoreVerdict, validateScoringWeights } from '../lib/check/scoring.js';

async function runTests() {
  console.log('🧪 Scoring Tests\n');

  let passed = 0;
  let failed = 0;

  const weights = { scope: 30, validation: 25, consistency: 15, continuity: 10, performance: 10, risk: 10 };

  function assert(label, condition) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${label}`);
    } else {
      failed++;
      console.log(`  ❌ ${label}`);
    }
  }

  // Test: no findings → score 100
  assert('no findings → score 100', computeCompositeScore([], weights) === 100);
  assert('null findings → score 100', computeCompositeScore(null, weights) === 100);
  assert('undefined findings → score 100', computeCompositeScore(undefined, weights) === 100);

  // Test: empty findings → score 100
  assert('empty array → score 100', computeCompositeScore([], weights) === 100);

  // Test: single warning deducts
  const singleWarning = [{ severity: 'warning', category: 'scope' }];
  const score1 = computeCompositeScore(singleWarning, weights);
  assert('single warning score < 100 (got ${score1})', score1 === 95);

  // Test: single error deducts more than warning
  const singleError = [{ severity: 'error', category: 'scope' }];
  const scoreError = computeCompositeScore(singleError, weights);
  const scoreWarn = computeCompositeScore(singleWarning, weights);
  assert(`error (${scoreError}) deducts more than warning (${scoreWarn})`, scoreError < scoreWarn);

  // Test: all categories deduct the same (weights not used in deduction)
  const scopeWarning = [{ severity: 'warning', category: 'scope' }];
  const perfWarning = [{ severity: 'warning', category: 'performance' }];
  const scopeScore = computeCompositeScore(scopeWarning, weights);
  const perfScore = computeCompositeScore(perfWarning, weights);
  assert(`scope and perf warnings deduct equally`, scopeScore === perfScore);

  // Test: score clamps at 0
  const manyErrors = Array(20).fill(null).map(() => ({ severity: 'error', category: 'validation' }));
  const clampedScore = computeCompositeScore(manyErrors, weights);
  assert(`many errors score clamps to 0 (got ${clampedScore})`, clampedScore === 0);

  // Test: score clamps at 100
  const clampedHigh = computeCompositeScore([{ severity: 'info', category: 'scope' }], weights);
  assert(`info severity → no deduction, score 100 (got ${clampedHigh})`, clampedHigh === 100);

  // Test: zero weights → score 100
  assert('zero weights → score 100', computeCompositeScore(singleWarning, { scope: 0, validation: 0, consistency: 0, continuity: 0, performance: 0, risk: 0 }) === 95);

  // Test: weights sum to non-100 still works
  assert('non-100 weights still compute', computeCompositeScore(singleWarning, { scope: 1, validation: 1, consistency: 1, continuity: 1, performance: 1, risk: 1 }) === 95);

  // Test: verdict mapping
  assert('no errors, score 100 → safe-to-deploy', getScoreVerdict(100, false) === 'safe-to-deploy');
  assert('no errors, score 90 → safe-to-deploy', getScoreVerdict(90, false) === 'safe-to-deploy');
  assert('no errors, score 85 → pass-with-concerns', getScoreVerdict(85, false) === 'pass-with-concerns');
  assert('no errors, score 70 → pass-with-concerns', getScoreVerdict(70, false) === 'pass-with-concerns');
  assert('no errors, score 50 → needs-attention', getScoreVerdict(50, false) === 'needs-attention');
  assert('no errors, score 39 → high-risk', getScoreVerdict(39, false) === 'high-risk');
  assert('no errors, score 0 → high-risk', getScoreVerdict(0, false) === 'high-risk');
  assert('has errors → blocked (even with high score)', getScoreVerdict(95, true) === 'blocked');
  assert('has errors → blocked (even with low score)', getScoreVerdict(10, true) === 'blocked');

  // Test: weight validation
  assert('valid weights sum to 100', validateScoringWeights(weights) === true);
  assert('invalid weights sum not 100', validateScoringWeights({ scope: 10, validation: 10, consistency: 10, continuity: 10, performance: 10, risk: 10 }) === false);

  // Test: combined scenario
  const mixed = [
    { severity: 'error', category: 'validation' },
    { severity: 'warning', category: 'scope' },
    { severity: 'warning', category: 'risk' },
    { severity: 'warning', category: 'continuity' }
  ];
  const mixedScore = computeCompositeScore(mixed, weights);
  const mixedVerdict = getScoreVerdict(mixedScore, true);
  assert(`mixed findings score = 70 (got ${mixedScore})`, mixedScore === 70);
  assert(`mixed findings with error → blocked`, mixedVerdict === 'blocked');

  const warningOnly = [
    { severity: 'warning', category: 'scope' },
    { severity: 'warning', category: 'risk' },
    { severity: 'warning', category: 'continuity' },
    { severity: 'warning', category: 'performance' }
  ];
  const warnScore = computeCompositeScore(warningOnly, weights);
  const warnVerdict = getScoreVerdict(warnScore, false);
  assert(`4 warnings → pass-with-concerns (score ${warnScore}, verdict ${warnVerdict})`, warnVerdict === 'pass-with-concerns');

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exitCode = 1;
});
