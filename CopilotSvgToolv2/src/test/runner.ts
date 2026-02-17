/**
 * Main test runner — orchestrates all test suites.
 *
 * Usage:
 *   npx tsx src/test/runner.ts                 # Run all suites
 *   npx tsx src/test/runner.ts --static        # Run static only
 *   npx tsx src/test/runner.ts --animated      # Run animated only
 *   npx tsx src/test/runner.ts --stress        # Run stress tests only
 */
import { staticSvgTests } from './static.test.js';
import { animatedSvgTests } from './animated.test.js';
import { stressTests } from './stress.test.js';
import { shutdownBrowserPool } from '../browserPool.js';
import type { SuiteResult } from './helpers.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runAll = args.length === 0 || args.includes('--all');
  const runStatic = runAll || args.includes('--static');
  const runAnimated = runAll || args.includes('--animated');
  const runStress = runAll || args.includes('--stress');

  process.stdout.write('\n' + '═'.repeat(70) + '\n');
  process.stdout.write('  🧪  CopilotSvgTool — Comprehensive Test Suite\n');
  process.stdout.write('═'.repeat(70) + '\n\n');

  const suites: SuiteResult[] = [];
  const totalStart = performance.now();

  if (runStatic) {
    process.stdout.write('─'.repeat(50) + '\n');
    process.stdout.write('🖼  Static SVG Tests\n');
    process.stdout.write('─'.repeat(50) + '\n');
    suites.push(await staticSvgTests());
  }

  if (runAnimated) {
    process.stdout.write('─'.repeat(50) + '\n');
    process.stdout.write('🎬  Animated SVG Tests\n');
    process.stdout.write('─'.repeat(50) + '\n');
    suites.push(await animatedSvgTests());
  }

  if (runStress) {
    process.stdout.write('─'.repeat(50) + '\n');
    process.stdout.write('💥  Stress Tests\n');
    process.stdout.write('─'.repeat(50) + '\n');
    suites.push(await stressTests());
  }

  // Always clean up the browser pool after tests.
  await shutdownBrowserPool();

  const totalDuration = performance.now() - totalStart;

  // ──── Summary ────
  process.stdout.write('\n' + '═'.repeat(70) + '\n');
  process.stdout.write('  📊  FINAL SUMMARY\n');
  process.stdout.write('═'.repeat(70) + '\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const suite of suites) {
    totalPassed += suite.passed;
    totalFailed += suite.failed;
    totalTests += suite.total;
    const icon = suite.failed === 0 ? '✅' : '❌';
    process.stdout.write(
      `  ${icon} ${suite.suiteName}: ${suite.passed}/${suite.total} passed (${suite.durationMs}ms)\n`
    );

    // Show failed tests
    for (const r of suite.results) {
      if (!r.passed) {
        process.stdout.write(`     └─ ❌ ${r.name}: ${r.error}\n`);
      }
    }
  }

  process.stdout.write(`\n  Total: ${totalPassed}/${totalTests} passed, ${totalFailed} failed (${Math.round(totalDuration)}ms)\n`);
  process.stdout.write('═'.repeat(70) + '\n\n');

  const memUsage = process.memoryUsage();
  process.stdout.write(`  Memory: heap=${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, rss=${Math.round(memUsage.rss / 1024 / 1024)}MB\n\n`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`\n💥 Test runner crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(2);
});
