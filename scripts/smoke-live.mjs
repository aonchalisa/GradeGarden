// Optional live smoke test. Creates two throwaway accounts in the target project
// and always deletes them. Requires an authenticated Supabase CLI.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { usernameEmail } from '../src/identity.js';

const project = process.env.SMOKE_PROJECT_REF;
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:4174';
if (!project) throw new Error('Set SMOKE_PROJECT_REF to the Grade Garden project');
const keys = JSON.parse(execFileSync('npx', ['--yes', 'supabase@latest', 'projects', 'api-keys', `--remote=${project}`, '--reveal', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const anon = keys.find(k => k.name === 'anon').api_key;
const service = keys.find(k => k.name === 'service_role').api_key;
const url = `https://${project}.supabase.co`;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const ids = [], suffix = randomBytes(5).toString('hex');
const accounts = [`smoke_a_${suffix}`, `smoke_b_${suffix}`];
const password = randomBytes(24).toString('base64url');
let browser;
async function login(page, username) {
  await page.goto(origin);
  await page.locator('[name=email]').fill(username);
  await page.locator('[name=password]').fill(password);
  await page.locator('#auth-submit').click();
  await page.locator('#app-main').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#save-status').dataset.kind === 'saved', { timeout: 30000 });
}
try {
  // Exercise public registration, not an admin-created/auto-verified shortcut.
  for (const username of accounts) {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.auth.signUp({ email: usernameEmail(username), password, options: { data: { username } } });
    if (result.error) throw new Error(`Public signup failed: ${result.error.code}`);
    assert.ok(result.data.session, 'Username signup must return a session without SMTP');
    ids.push(result.data.user.id);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const one = await browser.newContext(), two = await browser.newContext();
  const a = await one.newPage(), b = await two.newPage();
  const errors = []; a.on('pageerror', e => errors.push(e.message)); b.on('pageerror', e => errors.push(e.message));
  await login(a, accounts[0]);
  assert.equal(await a.locator('[data-grade=c0]').inputValue(), '');
  await a.locator('[data-grade=c0]').selectOption('A');
  await a.waitForFunction(() => document.querySelector('#save-status').dataset.kind === 'saved');
  await login(b, accounts[0]);
  assert.equal(await b.locator('[data-grade=c0]').inputValue(), 'A');
  await b.locator('#logout').click(); await b.locator('#account-screen').waitFor({ state: 'visible' });
  await login(b, accounts[1]);
  assert.equal(await b.locator('[data-grade=c0]').inputValue(), '');
  // Test row isolation over real PostgREST with a regular user's access token.
  const clientB = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await clientB.auth.signInWithPassword({ email: usernameEmail(accounts[1]), password });
  const leak = await clientB.from('study_plans').select('*').eq('user_id', ids[0]);
  assert.ifError(leak.error); assert.deepEqual(leak.data, []);
  const attempt = await clientB.from('study_plans').update({ data: {} }).eq('user_id', ids[0]).select();
  assert.ifError(attempt.error); assert.deepEqual(attempt.data, []);
  const guest = createClient(url, anon, { auth: { persistSession: false } });
  assert.ok((await guest.from('study_plans').select('*')).error);
  assert.deepEqual(errors, []);
  console.log('PASS LIVE: public username signup, real login, autosave to Supabase, new-device restore, account isolation, RLS denial and guest rejection.');
} finally {
  await browser?.close();
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('Test account cleanup failed for ID', id);
  }
  console.log('Temporary smoke accounts removed.');
}
