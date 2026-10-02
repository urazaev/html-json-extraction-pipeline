import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));

test('bundled CLI demonstrates two successes and an expected field failure', () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', entry], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(
    report.fields.map((field: { ok: boolean }) => field.ok),
    [true, true, false],
  );
  assert.equal(report.fields[0].value.minorUnits, 123450);
  assert.equal(report.fields[2].error.code, 'NO_MATCH');
});

test('CLI refuses arguments rather than treating them as URLs or file paths', () => {
  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', entry, 'https://example.invalid'],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(run.status, 2);
  assert.match(run.stderr, /accepts no arguments/);
  assert.equal(run.stdout, '');
});
