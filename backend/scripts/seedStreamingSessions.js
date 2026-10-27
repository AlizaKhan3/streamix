/**
 * Demo: 1,000,000 active streaming sessions (Redis hot counters).
 *
 *   TOTAL=1000000 node scripts/seedStreamingSessions.js
 *   curl -s http://localhost:4000/analytics/streaming | jq
 */
require('dotenv').config();
const { seedActiveSessions } = require('../shared/streamingSessions');

const TOTAL = Number(process.env.TOTAL || 1_000_000);

async function main() {
  console.log(`[seedStreaming] setting active sessions = ${TOTAL}…`);
  const stats = await seedActiveSessions(TOTAL);
  console.log(JSON.stringify(stats, null, 2));
  console.log('\nShow sir: curl -s http://localhost:4000/analytics/streaming | jq .activeSessions');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
