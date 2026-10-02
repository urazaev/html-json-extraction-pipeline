import { readFile } from 'node:fs/promises';
import { extract } from './extract.js';

if (process.argv.length > 2) {
  console.error('This demo accepts no arguments. It reads only the bundled fixtures.');
  process.exitCode = 2;
} else {
  const fixture = (name: string) =>
    readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  const [config, html, json] = await Promise.all([
    fixture('config.json'),
    fixture('catalog.html'),
    fixture('catalog.json'),
  ]);
  const report = extract(JSON.parse(config) as unknown, { html, json });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
