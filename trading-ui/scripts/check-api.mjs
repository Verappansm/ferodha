// Regenerates every API client into a scratch directory, with the same pinned
// generator and settings as openapitools.json, and compares each result with
// its committed tree (the customer app's src/app/api/generated/ and the admin
// app's projects/admin/src/app/api/generated/). Exits 1 if any differs, which
// means a contract has moved ahead of the committed client: run
// `npm run generate:api` and commit the result with the code that adapts to it.
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const config = JSON.parse(readFileSync('openapitools.json', 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'trading-ui-api-check-'));

try {
  // Where each generator's committed output lives, keyed by generator name.
  const committed = {};
  for (const [name, generator] of Object.entries(config['generator-cli'].generators)) {
    committed[name] = generator.output;
    generator.output = join(scratch, name);
  }
  const scratchConfig = join(scratch, 'openapitools.json');
  writeFileSync(scratchConfig, JSON.stringify(config, null, 2));
  execSync(`npx openapi-generator-cli generate --openapitools "${scratchConfig}"`, {
    stdio: 'ignore',
  });

  const differences = Object.entries(committed).flatMap(([name, dir]) =>
    compare(dir, join(scratch, name)).map((line) => `${dir}: ${line}`),
  );
  if (differences.length > 0) {
    console.error('Generated clients are stale. Differences:');
    for (const line of differences) console.error(`  ${line}`);
    console.error('Run `npm run generate:api` and commit the result.');
    process.exitCode = 1;
  } else {
    console.log('Generated clients match the contracts.');
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

function compare(committedRoot, freshRoot) {
  const committed = listFiles(committedRoot);
  const fresh = listFiles(freshRoot);
  const differences = [];
  for (const file of new Set([...committed, ...fresh])) {
    if (!committed.includes(file)) differences.push(`missing from the commit: ${file}`);
    else if (!fresh.includes(file)) differences.push(`not written by the generator: ${file}`);
    else if (read(join(committedRoot, file)) !== read(join(freshRoot, file)))
      differences.push(`changed: ${file}`);
  }
  return differences.sort();
}

function listFiles(root, dir = root) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? listFiles(root, path)
      : [relative(root, path).replaceAll('\\', '/')];
  });
}

// A Windows checkout may hold CRLF where the generator writes LF.
function read(path) {
  return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
}
