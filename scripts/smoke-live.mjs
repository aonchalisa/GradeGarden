// Optional live smoke test. Creates two throwaway accounts in the target project
// and always deletes them. Requires an authenticated Supabase CLI.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { usernameEmail } from '../src/identity.js';
import { authPassword } from '../src/password.js';
import { SEED } from '../src/seed.js';
import { COURSE_GROUPS, matchesCourse } from '../src/planning.js';

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
const password = randomBytes(2).toString('hex'); // Verify the four-character minimum end to end.
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
    const result = await client.auth.signUp({ email: usernameEmail(username), password: await authPassword(password), options: { data: { username } } });
    if (result.error) throw new Error(`Public signup failed: ${result.error.code}`);
    assert.ok(result.data.session, 'Username signup must return a session without SMTP');
    ids.push(result.data.user.id);
    if (username === accounts[0]) {
      const legacy = structuredClone(SEED);
      legacy.terms.splice(6, 0, { id: 't6', name: 'ปี 3 / ฤดูร้อน', year: 3 });
      const practice = legacy.courses.find(c => c.name === 'ENG PRACTICE');
      practice.term = 't6'; practice.grade = 'B+'; practice.credits = 2;
      const saved = await client.rpc('save_study_plan', { plan_data: legacy, expected_revision: null });
      assert.ifError(saved.error);
    }
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const one = await browser.newContext(), two = await browser.newContext();
  const a = await one.newPage(), b = await two.newPage();
  const errors = []; a.on('pageerror', e => errors.push(e.message)); b.on('pageerror', e => errors.push(e.message));
  await login(a, accounts[0]);
  assert.equal(await a.locator('[data-grade=c0]').inputValue(), '');
  assert.equal(await a.locator('#planner-greeting').textContent(), `สวัสดี ${accounts[0]} มาคำนวณเกรดกัน`);
  assert.equal(await a.locator('.term').count(), 8);
  assert.equal(await a.locator('[data-term=t7]').getByText('ENG PRACTICE', { exact: true }).count(), 1);
  const migrated = await admin.from('study_plans').select('data').eq('user_id', ids[0]).single();
  assert.ifError(migrated.error);
  assert.ok(migrated.data.data.terms.every(t => t.id !== 't6'));
  const practice = migrated.data.data.courses.find(c => c.name === 'ENG PRACTICE');
  assert.equal(practice.grade, 'B+'); assert.equal(practice.credits, 2); assert.equal(practice.term, 't7');
  assert.equal(await a.locator('#app-main').getByText('นก.', { exact: false }).count(), 0);
  assert.equal(await a.locator('#app-main').getByText('สะสม', { exact: false }).count(), 0);
  await a.setViewportSize({ width: 390, height: 844 });
  assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await a.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await a.locator('#gened-progress').getByText('0 / 4 วิชา',{exact:true}).count(),1);
  await a.locator('#settings').click();
  assert.equal(await a.locator('[name=genEdMinCourses]').inputValue(),'4');
  assert.equal(await a.locator('.settings-su h3').textContent(),'S/U');
  assert.ok((await a.locator('#settings-warning').textContent()).includes('137'));
  await a.locator('#settings-dialog [data-close]').click();
  const gpaxBeforeSu=await a.locator('#stats .stat-value').first().textContent();
  await a.locator('[data-edit=c48]').click();
  assert.equal(await a.locator('[name=gradingMode]').inputValue(),'su');
  assert.equal(await a.locator('[name=isGenEd]').isChecked(),true);
  await a.locator('[name=credits]').fill('3');await a.locator('#course-form [name=grade]').selectOption('S');
  await a.locator('#course-form button[type=submit]').click();
  await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('#stats .stat-value').first().textContent(),gpaxBeforeSu);
  assert.equal(await a.locator('#gened-progress').getByText('1 / 4 วิชา',{exact:true}).count(),1);
  assert.equal(await a.locator('.su-course-section [data-course=c48]').count(),1);
  await a.locator('#category-filter').selectOption('su');
  assert.equal(await a.locator('.course').count(),5);
  assert.equal(await a.locator('.course-list > .course').count(),0);
  await a.locator('#category-filter').selectOption('all');
  const summary = await a.locator('#stats').textContent();
  for (const group of COURSE_GROUPS) {
    await a.locator('#category-filter').selectOption(group.id);
    assert.equal(await a.locator('.course').count(), SEED.courses.filter(c => matchesCourse(c, { group: group.id })).length);
    assert.equal(await a.locator('#stats').textContent(), summary, 'filter must not change GPAX');
  }
  await a.locator('#category-filter').selectOption('required');
  await a.locator('#search').fill('COMP');
  await a.locator('[data-year="4"]').click();
  const fourth = new Set(SEED.terms.filter(t => t.year === 4).map(t => t.id));
  assert.equal(await a.locator('.course').count(), SEED.courses.filter(c => fourth.has(c.term) && matchesCourse(c, { group: 'required', query: 'COMP' })).length);
  await a.locator('#category-filter').selectOption('all'); await a.locator('#search').fill(''); await a.locator('[data-year="all"]').click();
  await a.locator('#honors-remaining').fill('12'); await a.locator('#honors-remaining').press('Tab');
  await a.locator('[data-honors-target="3.25"]').click();
  await a.waitForFunction(() => document.querySelector('#save-status').dataset.kind === 'saved');
  const settings = await admin.from('study_plans').select('data').eq('user_id', ids[0]).single();
  assert.deepEqual(settings.data.data.honors, { target: 3.25, remainingCredits: 12 });
  await a.screenshot({ path: '/tmp/grade-garden-honors.png' });
  await a.locator('[data-grade=c0]').selectOption('A');
  await a.waitForFunction(() => document.querySelector('#save-status').dataset.kind === 'saved');
  await login(b, accounts[0]);
  assert.equal(await b.locator('[data-grade=c0]').inputValue(), 'A');
  assert.equal(await b.locator('#honors-remaining').inputValue(), '12');
  assert.equal(await b.locator('.su-course-section [data-grade=c48]').inputValue(),'S');
  assert.equal(await b.locator('#gened-progress').getByText('1 / 4 วิชา',{exact:true}).count(),1);
  assert.equal(await b.locator('[data-honors-target="3.25"]').getAttribute('aria-pressed'), 'true');
  await b.locator('#honors-auto').click(); await b.waitForFunction(() => document.querySelector('#save-status').dataset.kind === 'saved');
  assert.equal(await b.locator('#honors-remaining').inputValue(), String(SEED.courses.filter(c=>['','I'].includes(c.grade)&&c.name!=='ENG PRACTICE'&&c.id!=='c0').reduce((n,c)=>n+c.credits,0)));
  await b.locator('#logout').click(); await b.locator('#account-screen').waitFor({ state: 'visible' });
  await login(b, accounts[1]);
  assert.equal(await b.locator('[data-grade=c0]').inputValue(), '');
  // Test row isolation over real PostgREST with a regular user's access token.
  const clientB = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await clientB.auth.signInWithPassword({ email: usernameEmail(accounts[1]), password: await authPassword(password) });
  const leak = await clientB.from('study_plans').select('*').eq('user_id', ids[0]);
  assert.ifError(leak.error); assert.deepEqual(leak.data, []);
  const attempt = await clientB.from('study_plans').update({ data: {} }).eq('user_id', ids[0]).select();
  assert.ifError(attempt.error); assert.deepEqual(attempt.data, []);
  const guest = createClient(url, anon, { auth: { persistSession: false } });
  assert.ok((await guest.from('study_plans').select('*')).error);
  assert.deepEqual(errors, []);
  console.log('PASS LIVE: four GenEd course requirement, separate SU headings/filter, SU credits counted once without changing GPAX, saved grading mode/GenEd flag, honors and cross-device persistence.');
} finally {
  await browser?.close();
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('Test account cleanup failed for ID', id);
  }
  console.log('Temporary smoke accounts removed.');
}
