// Measures one bcrypt verification at a range of costs, using the same
// library the service uses (bcryptjs). Run it ON THE HARDWARE YOU DEPLOY TO
// (inside the production container / VM), not on a laptop:
//
//   node scripts/bcrypt-cost-benchmark.mjs
//
// Paste the output into design/auth-password-hashing.md.
import bcrypt from 'bcryptjs';
import os from 'node:os';

const RUNS = 5;
const password = 'benchmark-password-not-a-real-one';

console.log(`node ${process.version} | ${os.cpus()[0]?.model ?? 'unknown cpu'} | ${os.cpus().length} cores`);
console.log('cost | median verify (ms)');

for (const cost of [10, 11, 12, 13, 14]) {
  const hash = await bcrypt.hash(password, cost);
  const timings = [];
  for (let i = 0; i < RUNS; i += 1) {
    const start = process.hrtime.bigint();
    await bcrypt.compare(password, hash);
    timings.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  timings.sort((a, b) => a - b);
  console.log(`${String(cost).padStart(4)} | ${timings[Math.floor(RUNS / 2)].toFixed(0)}`);
}
