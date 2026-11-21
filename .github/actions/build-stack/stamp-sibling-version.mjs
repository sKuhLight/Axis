#!/usr/bin/env node
// Stamp a SIBLING package's version from the release tag it is pinned at.
//
// Versions come from tags, not files: each repo's release build injects ITS OWN tag version into
// its package.json. Siblings, however, are built from source at the ref pinned in stack.lock.json,
// where the COMMITTED package.json version is stale (the committed value is never bumped). That
// stale value then leaks into diagnostics bundles and the UI's engine version. This script closes
// the gap: when the sibling was checked out at a release tag, rewrite its package.json `version`
// to the tag (minus the leading "v") BEFORE it is built.
//
//   node stamp-sibling-version.mjs <ref> <package-dir> [label]
//   node stamp-sibling-version.mjs --self-test
//
//   <ref>          the ref the sibling was checked out at ('' / HEAD / branch / sha = not a tag)
//   <package-dir>  directory holding the package.json to stamp (forgefx-midi: repo root;
//                  ForgeFX: server/)
//   [label]        name used in log + step-summary lines (default: <package-dir>)
//
// A ref is a release tag iff it matches ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ (an optional
// `refs/tags/` prefix is tolerated). Anything else is a no-op: CI integration builds track default
// branch HEAD / SHAs and must keep the committed version untouched. package-lock.json's root
// version fields are kept in sync (as `npm version` would), when a lock sits next to the package.
//
// Pure node (no jq / sed -i), so it behaves the same on the ubuntu / windows / macos runners.
// KEEP IN SYNC: byte-identical copies live in Axis (.github/actions/build-stack/stamp-sibling-version.mjs,
// used by the build-stack action) and ForgeFX (.github/scripts/stamp-sibling-version.mjs, used by its
// release.yml for the codec) — the repos cannot share a file.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const TAG_RE = /^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

/** '0.5.0' for a release-tag ref ('v0.5.0', 'refs/tags/v0.5.0'), null for anything else. */
function tagVersion(ref) {
  const r = String(ref ?? '').trim().replace(/^refs\/tags\//, '');
  return TAG_RE.test(r) ? r.slice(1) : null;
}

/** Read a JSON file, remembering its formatting so the rewrite is a minimal diff. */
function readJson(file) {
  const raw = readFileSync(file, 'utf8');
  const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? 2;
  return { data: JSON.parse(raw.replace(/^﻿/, '')), indent, crlf: raw.includes('\r\n'), finalNewline: /\n$/.test(raw) };
}

function writeJson(file, doc) {
  let out = JSON.stringify(doc.data, null, doc.indent);
  if (doc.crlf) out = out.replace(/\n/g, '\r\n');
  if (doc.finalNewline) out += doc.crlf ? '\r\n' : '\n';
  writeFileSync(file, out);
}

/**
 * Stamp `<dir>/package.json` (and `<dir>/package-lock.json` root fields) when `ref` is a release tag.
 * Returns { stamped, version, name, previous }. Throws if a tag-pinned package.json is unreadable —
 * a tagged sibling without a package.json means the checkout is wrong and must not build silently.
 */
function stamp({ ref, dir, label = dir, summaryFile, log = console.log }) {
  const version = tagVersion(ref);
  if (version === null) {
    log(`${label}: ref '${ref || '<default branch HEAD>'}' is not a release tag — package version left untouched`);
    return { stamped: false };
  }
  const pkgFile = join(dir, 'package.json');
  if (!existsSync(pkgFile)) throw new Error(`${label}: ${pkgFile} not found — cannot stamp tag ${ref}`);
  const pkg = readJson(pkgFile);
  const previous = pkg.data.version;
  pkg.data.version = version;
  writeJson(pkgFile, pkg);

  const lockFile = join(dir, 'package-lock.json');
  if (existsSync(lockFile)) {
    const lock = readJson(lockFile);
    let touched = false;
    if (typeof lock.data.version === 'string') { lock.data.version = version; touched = true; }
    const root = lock.data.packages?.[''];
    if (root && typeof root.version === 'string') { root.version = version; touched = true; }
    if (touched) writeJson(lockFile, lock);
  }

  const name = pkg.data.name ?? label;
  const line = `${label}: stamped ${name} ${previous ?? '<none>'} -> ${version} (pinned tag ${ref})`;
  log(line);
  if (summaryFile) appendFileSync(summaryFile, `- ${label}: \`${name}\` version stamped \`${previous ?? 'none'}\` → \`${version}\` (pinned tag \`${ref}\`)\n`);
  return { stamped: true, version, name, previous };
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'stamp-sibling-'));
  const quiet = () => {};
  let checks = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
  const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };
  let n = 0;
  const fixture = (extra = {}) => {
    const dir = join(root, `pkg${n++}`);
    mkdirSync(dir, { recursive: true });
    const pkg = { name: 'forgefx-midi', version: '0.4.3', type: 'module', scripts: { build: 'tsc' }, dependencies: { a: '^1.0.0' }, ...extra };
    const lock = { name: 'forgefx-midi', version: '0.4.3', lockfileVersion: 3, packages: { '': { name: 'forgefx-midi', version: '0.4.3' }, 'node_modules/a': { version: '1.2.3' } } };
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
    return dir;
  };
  const read = (dir, f = 'package.json') => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const text = (dir, f = 'package.json') => readFileSync(join(dir, f), 'utf8');

  try {
    // tag -> stamped, rest of the package untouched, lock root synced, formatting preserved
    {
      const dir = fixture();
      const before = read(dir);
      const r = stamp({ ref: 'v0.5.0', dir, log: quiet });
      eq(r.stamped, true, 'tag stamps');
      eq(read(dir).version, '0.5.0', 'package.json version = tag without v');
      eq(r.previous, '0.4.3', 'previous version reported');
      eq(JSON.stringify({ ...read(dir), version: before.version }), JSON.stringify(before), 'only version changed');
      eq(read(dir, 'package-lock.json').version, '0.5.0', 'lock top-level version synced');
      eq(read(dir, 'package-lock.json').packages[''].version, '0.5.0', 'lock root package version synced');
      eq(read(dir, 'package-lock.json').packages['node_modules/a'].version, '1.2.3', 'lock dependency untouched');
      ok(text(dir).endsWith('}\n') && text(dir).includes('\n  "name"'), 'indent + final newline preserved');
    }
    // pre-release tags (ForgeFX ships -beta)
    for (const [ref, want] of [['v0.8.0-beta', '0.8.0-beta'], ['v1.2.3-rc.1', '1.2.3-rc.1'], ['v10.20.30', '10.20.30'], ['refs/tags/v0.6.0', '0.6.0'], ['v0.6.0 ', '0.6.0']]) {
      const dir = fixture();
      stamp({ ref, dir, log: quiet });
      eq(read(dir).version, want, `${ref} -> ${want}`);
    }
    // non-tag refs -> byte-for-byte untouched (both files)
    for (const ref of ['', undefined, 'HEAD', 'main', 'master', 'feature/x', '0123456789abcdef0123456789abcdef01234567', 'abc1234',
      '0.5.0', 'v1.2', 'v1.2.3+build', 'v1.2.3-', 'vx.y.z', 'refs/heads/v1.2.3']) {
      const dir = fixture();
      const [p, l] = [text(dir), text(dir, 'package-lock.json')];
      const r = stamp({ ref, dir, log: quiet });
      eq(r.stamped, false, `'${ref}' is not a tag`);
      eq(text(dir), p, `'${ref}' leaves package.json byte-identical`);
      eq(text(dir, 'package-lock.json'), l, `'${ref}' leaves lock byte-identical`);
    }
    // no lock file next to the package (ForgeFX server always has one, but don't require it)
    {
      const dir = fixture();
      rmSync(join(dir, 'package-lock.json'));
      eq(stamp({ ref: 'v0.5.0', dir, log: quiet }).stamped, true, 'works without a lock');
      ok(!existsSync(join(dir, 'package-lock.json')), 'does not create a lock');
    }
    // CRLF + tab indent + no final newline preserved
    {
      const dir = fixture();
      writeFileSync(join(dir, 'package.json'), '{\r\n\t"name": "x",\r\n\t"version": "0.0.1"\r\n}');
      stamp({ ref: 'v0.5.0', dir, log: quiet });
      eq(text(dir), '{\r\n\t"name": "x",\r\n\t"version": "0.5.0"\r\n}', 'CRLF/tab/no-final-newline preserved');
    }
    // step summary line
    {
      const dir = fixture();
      const summary = join(root, 'summary.md');
      stamp({ ref: 'v0.5.0', dir, label: 'forgefx-midi', summaryFile: summary, log: quiet });
      ok(/forgefx-midi.*0\.4\.3.*0\.5\.0/.test(text(root, 'summary.md')), 'step summary records old -> new');
      const before = text(root, 'summary.md');
      stamp({ ref: '', dir: fixture(), summaryFile: summary, log: quiet });
      eq(text(root, 'summary.md'), before, 'no-op writes nothing to the summary');
    }
    // tag-pinned but no package.json -> hard failure (never build a mis-checked-out sibling silently)
    assert.throws(() => stamp({ ref: 'v0.5.0', dir: join(root, 'does-not-exist'), log: quiet }), /not found/);
    checks++;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(`stamp-sibling-version self-test: ok (${checks} checks)`);
}

const [first, second, third] = process.argv.slice(2);
if (first === '--self-test') {
  selfTest();
} else if (second === undefined) {
  console.error('usage: stamp-sibling-version.mjs <ref> <package-dir> [label]\n       stamp-sibling-version.mjs --self-test');
  process.exit(2);
} else {
  try {
    stamp({ ref: first, dir: second, label: third || second, summaryFile: process.env.GITHUB_STEP_SUMMARY });
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
