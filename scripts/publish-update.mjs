#!/usr/bin/env node
// Publish a signed Windows release only after verifying the uploaded installer itself.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkConfig, checkManifest, compareVersions, verifySignature, EXPECTED_ENDPOINT } from './verify-updater.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = checkConfig(root);
const tag = `v${version}`;
const repo = 'SolairsVIP/pd2-trader-chinese';
const api = `https://api.github.com/repos/${repo}`;
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const pubkey = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json'))).plugins.updater.pubkey;
const token = process.env.GITHUB_TOKEN;
const commit = process.env.RELEASE_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('RELEASE_COMMIT must be a full commit SHA');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) throw new Error('Tag/version mismatch');
const notes = readFileSync(path.join(root, `docs/releases/${tag}.md`), 'utf8');
const name = `PD2.Trader.CN_${version}_x64-setup.exe`;
const dir = path.resolve(arg('--dir', path.join(root, 'src-tauri/target/release/bundle/nsis')));
const installers = readdirSync(dir).filter((file) => file.endsWith('_x64-setup.exe') && file.includes(version));
if (installers.length !== 1) throw new Error('Expected exactly one matching NSIS installer');
const installer = readFileSync(path.join(dir, installers[0]));
const signature = readFileSync(path.join(dir, `${installers[0]}.sig`), 'utf8').trim();
verifySignature(pubkey, signature, installer);
const manifest = {
  version, notes, pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': { signature, url: `https://github.com/${repo}/releases/download/${tag}/${name}` } },
};
checkManifest(manifest, { expectVersion: version });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = new Map([
  [name, installer],
  [`${name}.sig`, Buffer.from(`${signature}\n`)],
  ['latest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
  ['RELEASE-NOTES.zh-CN.md', Buffer.from(notes)],
]);
// Package the exact tagged source alongside the installer, including local feature documentation.
files.set(`pd2-trader-chinese-${version}-source.zip`, execFileSync('git', [
  '-c', `safe.directory=${root}`, 'archive', '--format=zip', `--prefix=pd2-trader-chinese-${version}/`, commit,
], { cwd: root, maxBuffer: 128 * 1024 * 1024 }));
const guide = path.join(root, 'docs', 'PD2查价器中文版功能介绍.pdf');
try { files.set('PD2.Trader.CN_User.Guide.pdf', readFileSync(guide)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
files.set('SHA256SUMS.txt', Buffer.from([...files].map(([file, bytes]) => `${sha(bytes)}  ${file}`).join('\n') + '\n'));
const out = path.resolve(arg('--out', path.join(root, 'src-tauri/target/update-release')));
mkdirSync(out, { recursive: true });
for (const [file, bytes] of files) writeFileSync(path.join(out, file), bytes);
console.log(`Prepared v${version}: signed installer verified (${installer.length} bytes)`);

async function request(url, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  const response = await fetch(url, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'PD2-Trader-CN-Release',
      'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' } : {}) },
    body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status}`);
  return response;
}
const json = async (url, options) => (await request(url, options)).json();
const assetBytes = async (asset) => Buffer.from(await (await request(asset.url, { accept: 'application/octet-stream' })).arrayBuffer());

async function verifyUploaded(release) {
  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  if (!assets.has('latest.json')) throw new Error('Uploaded latest.json missing');
  const remote = JSON.parse((await assetBytes(assets.get('latest.json'))).toString('utf8'));
  const entries = checkManifest(remote, { expectVersion: version });
  for (const entry of entries) {
    if (entry.url !== manifest.platforms[entry.name].url) throw new Error('Manifest URL does not target this release');
    const asset = assets.get(name);
    if (!asset) throw new Error('Uploaded installer missing');
    verifySignature(pubkey, entry.signature, await assetBytes(asset));
  }
  console.log('Uploaded manifest, installer and signature verified');
}

async function publish() {
  if (flag('--prepare-only')) return;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  let tagRef;
  try { tagRef = await json(`${api}/git/ref/tags/${tag}`); }
  catch (error) { if (!error.message.endsWith('HTTP 404')) throw error; }
  if (tagRef) {
    let object = tagRef.object;
    if (object.type === 'tag') object = (await json(`${api}/git/tags/${object.sha}`)).object;
    if (object.type !== 'commit' || object.sha !== commit) throw new Error('Existing tag points to different source; refusing to move it');
  } else {
    await json(`${api}/git/refs`, { method: 'POST', body: { ref: `refs/tags/${tag}`, sha: commit } });
  }
  const releases = await json(`${api}/releases?per_page=100`);
  let release = releases.find((r) => r.tag_name === tag);
  if (release && !release.draft) {
    await verifyUploaded(release);
    console.log('Release already published; existing assets preserved');
    return;
  }
  const liveResponse = await fetch(EXPECTED_ENDPOINT, { signal: AbortSignal.timeout(30000) });
  if (liveResponse.ok) {
    const live = await liveResponse.json();
    if (compareVersions(version, live.version) <= 0) throw new Error('Refusing to replace or downgrade the live update');
  } else if (liveResponse.status !== 404) throw new Error(`Cannot verify current update: HTTP ${liveResponse.status}`);
  if (!release) release = await json(`${api}/releases`, { method: 'POST', body: {
    tag_name: tag, target_commitish: commit, name: `PD2 Trader 中文版 ${version}`, body: notes, draft: true, prerelease: false,
  } });
  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  for (const [file, bytes] of files) {
    if (assets.has(file)) {
      if (sha(await assetBytes(assets.get(file))) !== sha(bytes)) throw new Error(`Draft asset differs: ${file}; review it before retrying`);
      continue;
    }
    const upload = `${release.upload_url.split('{')[0]}?name=${encodeURIComponent(file)}`;
    await json(upload, { method: 'POST', body: bytes });
    console.log(`Uploaded ${file}`);
  }
  release = await json(`${api}/releases/${release.id}`);
  await verifyUploaded(release);
  if (flag('--draft-only')) { console.log(`Verified draft ${release.id}`); return; }
  await json(`${api}/releases/${release.id}`, { method: 'PATCH', body: { draft: false, make_latest: 'true' } });
  console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
}
publish().catch((error) => { console.error(`Release stopped: ${error.message}`); process.exitCode = 1; });
