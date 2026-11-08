// Optional live smoke test. Creates two throwaway accounts in the target project
// and always deletes them. Requires an authenticated Supabase CLI.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const LEGACY=JSON.parse(readFileSync(new URL('../tests/fixtures/legacy-plan.json',import.meta.url),'utf8'));
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
      const legacy = structuredClone(LEGACY);
      legacy.terms.splice(6, 0, { id: 't6', name: 'ปี 3 / ฤดูร้อน', year: 3 });
      legacy.courses[0].note = 'existing user note'; legacy.courses[0].code = 'MY-COURSE';
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
  assert.equal(await a.locator('.settings-su').count(),0);
  assert.ok((await a.locator('#settings-warning').textContent()).includes('137'));
  await a.locator('#settings-dialog [data-close]').click();
  const gpaxBeforeSu=await a.locator('#stats .stat-value').first().textContent();
  await a.locator('[data-edit=c48]').click();
  assert.equal(await a.locator('[name=gradingMode]').count(),0);
  assert.equal(await a.locator('[name=isGenEd]').isChecked(),true);
  await a.locator('[name=credits]').fill('3');await a.locator('#course-form [name=grade]').selectOption('S');
  await a.locator('#course-form button[type=submit]').click();
  await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('#stats .stat-value').first().textContent(),gpaxBeforeSu);
  assert.equal(await a.locator('#gened-progress').getByText('1 / 4 วิชา',{exact:true}).count(),1);
  assert.equal(await a.locator('.su-course-section').count(),0);
  assert.equal(await a.locator('#category-filter option[value=su]').count(),0);
  assert.equal(await a.locator('.course-list > .course').count(),LEGACY.courses.length);
  await a.locator('[data-grade=c48]').selectOption('U');
  await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('#stats .stat-value').first().textContent(),gpaxBeforeSu);
  assert.equal(await a.locator('#gened-progress').getByText('0 / 4 วิชา',{exact:true}).count(),1);
  await a.locator('[data-grade=c48]').selectOption('A');
  await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal((await a.locator('#stats .stat-value').first().textContent()).trim(),'3.80');
  await a.locator('[data-grade=c48]').selectOption('S');
  await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('#stats .stat-value').first().textContent(),gpaxBeforeSu);
  const remainingBefore=Number(await a.locator('#honors-basis').getAttribute('data-credits'));
  await a.locator('[data-toggle-count=c5]').click(); await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(Number(await a.locator('#honors-basis').getAttribute('data-credits')),remainingBefore-3);
  await a.locator('[data-toggle-count=c5]').click(); await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(Number(await a.locator('#honors-basis').getAttribute('data-credits')),remainingBefore);
  await a.locator('[data-toggle-count=c48]').click(); await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('#gened-progress').getByText('0 / 4 วิชา',{exact:true}).count(),1);
  await a.locator('[data-toggle-count=c48]').click(); await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('#gened-progress').getByText('1 / 4 วิชา',{exact:true}).count(),1);
  const summary = await a.locator('#stats').textContent();
  for (const group of COURSE_GROUPS) {
    await a.locator('#category-filter').selectOption(group.id);
    assert.equal(await a.locator('.course').count(), LEGACY.courses.filter(c => matchesCourse(c, { group: group.id })).length);
    assert.equal(await a.locator('#stats').textContent(), summary, 'filter must not change GPAX');
  }
  await a.locator('#category-filter').selectOption('required');
  await a.locator('#search').fill('COMP');
  await a.locator('[data-year="4"]').click();
  const fourth = new Set(LEGACY.terms.filter(t => t.year === 4).map(t => t.id));
  assert.equal(await a.locator('.course').count(), LEGACY.courses.filter(c => fourth.has(c.term) && matchesCourse(c, { group: 'required', query: 'COMP' })).length);
  await a.locator('#category-filter').selectOption('all'); await a.locator('#search').fill(''); await a.locator('[data-year="all"]').click();
  assert.equal(await a.locator('.honors-panel select').count(),0);assert.equal(await a.locator('.honors-panel input').count(),1);
  assert.ok(await a.locator('[data-recommendation]').count()>0);
  await a.locator('[data-honors-target="3.25"]').click();
  await a.waitForFunction(() => document.querySelector('#save-status').dataset.kind === 'saved');
  const settings = await admin.from('study_plans').select('data').eq('user_id', ids[0]).single();
  assert.deepEqual(settings.data.data.honors, { target: 3.25, mode: 'honors' });
  await a.screenshot({ path: '/tmp/grade-garden-honors.png' });
  await a.locator('[data-grade=c0]').selectOption('A');
  await a.waitForFunction(() => document.querySelector('#save-status').dataset.kind === 'saved');
  const beforeHide=(await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data;
  const otherBefore=(await admin.from('study_plans').select('data').eq('user_id',ids[1])).data;
  await a.locator('[data-toggle-count=c0]').click();await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('[data-toggle-count=c0]').getAttribute('aria-pressed'),'true');
  assert.equal(await a.locator('[data-grade=c0]').inputValue(),'A');
  assert.equal((await a.locator('#stats .stat-value').first().textContent()).trim(),'3.50');
  const hiddenPlan=(await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data;
  const wanted=structuredClone(beforeHide);wanted.courses.find(c=>c.id==='c0').hidden=true;
  assert.deepEqual(hiddenPlan,wanted,'hide may change only the selected course flag');
  await a.locator('[data-edit=c0]').click();await a.locator('#course-form button[type=submit]').click();
  await a.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await a.locator('[data-toggle-count=c0]').getAttribute('aria-pressed'),'true','editing must retain hidden state');
  await login(b, accounts[0]);
  assert.equal(await b.locator('[data-grade=c0]').inputValue(), 'A');
  assert.equal(await b.locator('[data-toggle-count=c0]').getAttribute('aria-pressed'),'true');
  await b.locator('[data-toggle-count=c0]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  const restored=(await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data;
  const expectedRestored=structuredClone(beforeHide);expectedRestored.courses.find(c=>c.id==='c0').hidden=false;
  assert.deepEqual(restored,expectedRestored,'unhide must preserve all prior grades/credits/notes/settings');
  assert.deepEqual((await admin.from('study_plans').select('data').eq('user_id',ids[1])).data,otherBefore,'another account must be untouched');
  assert.equal((await b.locator('#stats .stat-value').first().textContent()).trim(),'3.80');
  await b.setViewportSize({width:390,height:844});assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await b.setViewportSize({width:1440,height:1000});

  assert.equal(await b.locator('.honors-panel select').count(),0);assert.equal(await b.locator('.honors-panel input').count(),1);
  assert.equal(await b.locator('[data-grade=c48]').inputValue(),'S');
  assert.equal(await b.locator('#gened-progress').getByText('1 / 4 วิชา',{exact:true}).count(),1);
  assert.equal(await b.locator('[data-honors-target="3.25"]').getAttribute('aria-pressed'), 'true');
  await b.locator('[data-honors-target="3.6"]').click();
  await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.ok((await b.locator('#honors-recommendations').textContent()).includes('ตั้งเป้า'));
  await b.setViewportSize({width:390,height:844});assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await b.setViewportSize({width:1440,height:1000});
  // Add summer between academic terms, then edit order without losing courses.
  await b.locator('#add-term').click();await b.locator('#term-form [name=kind]').selectOption('summer');await b.locator('#term-form [name=name]').fill('ปี 1 / ฤดูร้อน');await b.locator('#term-form [name=year]').fill('1');await b.locator('#term-form [name=afterTerm]').selectOption('t1');
  await b.locator('#term-form button[type=submit]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  const afterSummer=(await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data;
  const summer=afterSummer.terms.find(t=>t.name==='ปี 1 / ฤดูร้อน');assert.equal(afterSummer.terms[2].id,summer.id);assert.equal(summer.kind,'summer');
  assert.deepEqual(await b.locator('[data-planner-year="1"] .term').evaluateAll(nodes=>nodes.map(n=>n.dataset.term)),['t0','t1',summer.id]);
  const yearOne=await b.locator('[data-planner-year="1"] .term').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.ok(yearOne.every(y=>Math.abs(y-yearOne[0])<1));
  assert.ok((await b.locator('[data-planner-year="2"]').boundingBox()).y>(await b.locator('[data-planner-year="1"]').boundingBox()).y);
  await b.locator('[data-planner-year="1"]').screenshot({path:'/tmp/grade-garden-year-summer.png'});
  await b.locator('[data-planner-year="1"] .year-terms').evaluate(el=>el.scrollLeft=el.scrollWidth);const summerScroll=await b.locator('[data-planner-year="1"] .year-terms').evaluate(el=>el.scrollLeft);assert.ok(summerScroll>0);
  await b.locator(`[data-add="${summer.id}"]`).click();await b.locator('#course-form [name=name]').fill('SUMMER TEST');await b.locator('#course-form [name=credits]').fill('3');await b.locator('#course-form [name=grade]').selectOption('B');await b.locator('#course-form button[type=submit]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.ok(Math.abs((await b.locator('[data-planner-year="1"] .year-terms').evaluate(el=>el.scrollLeft))-summerScroll)<2,'saving a summer course must retain horizontal scroll position');
  const orderBefore=(await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data;
  const globalBefore=await b.locator('#stats .stat-value').first().textContent();
  assert.ok((await b.locator('[data-term=t1] .term-metrics span').nth(1).textContent()).includes('4.00'));
  await b.locator('#edit-term-order').click();await b.locator(`[data-order-position="${summer.id}"]`).selectOption({value:'1'});
  await b.locator('#term-order-dialog .dialog-actions [data-close]').click();
  assert.equal((await b.locator('.term').evaluateAll(nodes=>nodes.map(n=>n.dataset.term)))[2],summer.id,'cancel must leave order unchanged');
  await b.locator('#edit-term-order').click();await b.locator(`[data-order-position="${summer.id}"]`).selectOption({value:'1'});await b.locator('#term-order-form button[type=submit]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal((await b.locator('.term').evaluateAll(nodes=>nodes.map(n=>n.dataset.term)))[1],summer.id);
  assert.ok((await b.locator('[data-term=t1] .term-metrics span').nth(1).textContent()).includes('3.50'));
  assert.equal(await b.locator('#stats .stat-value').first().textContent(),globalBefore);
  const orderAfter=(await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data;
  const expectedOrder=structuredClone(orderBefore);const removed=expectedOrder.terms.splice(2,1)[0];expectedOrder.terms.splice(1,0,removed);assert.deepEqual(orderAfter,expectedOrder);
  await b.reload();await b.locator('#app-main').waitFor({state:'visible'});assert.equal((await b.locator('.term').evaluateAll(nodes=>nodes.map(n=>n.dataset.term)))[1],summer.id);
  // Real mouse dragging uses the handle; only same-year rows can move.
  await b.locator('#edit-term-order').click();
  const dragHandle=await b.locator(`[data-order-handle="${summer.id}"]`).boundingBox(),dropRow=await b.locator('[data-order-row=t1]').boundingBox();
  await b.mouse.move(dragHandle.x+dragHandle.width/2,dragHandle.y+dragHandle.height/2);await b.mouse.down();await b.mouse.move(dropRow.x+30,dropRow.y+dropRow.height-8,{steps:12});
  await b.waitForFunction(id=>document.querySelectorAll('[data-order-row]')[2]?.dataset.orderRow===id,summer.id);await b.mouse.up();
  await b.locator('#term-order-dialog .dialog-actions [data-close]').click();
  await b.setViewportSize({width:390,height:844});await b.locator('#edit-term-order').click();
  assert.ok(await b.locator('#term-order-list').evaluate(el=>el.scrollHeight>el.clientHeight));await b.locator('#term-order-list').evaluate(el=>el.scrollTop=el.scrollHeight);assert.ok(await b.locator('#term-order-list').evaluate(el=>el.scrollTop>0));await b.locator('#term-order-list').evaluate(el=>el.scrollTop=0);
  const touchSession=await two.newCDPSession(b),touchHandle=await b.locator(`[data-order-handle="${summer.id}"]`).boundingBox(),touchTarget=await b.locator('[data-order-row=t1]').boundingBox();
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchHandle.x+touchHandle.width/2,y:touchHandle.y+touchHandle.height/2}]});
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchTarget.x+25,y:touchTarget.y+touchTarget.height-8}]});
  await b.waitForFunction(id=>document.querySelectorAll('[data-order-row]')[2]?.dataset.orderRow===id,summer.id);await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchSession.detach();
  await b.locator(`[data-order-handle="${summer.id}"]`).press('ArrowUp');assert.equal((await b.locator('[data-order-row]').evaluateAll(nodes=>nodes.map(n=>n.dataset.orderRow)))[1],summer.id);
  await b.locator('#term-order-dialog').screenshot({path:'/tmp/grade-garden-order-mobile.png'});await b.locator(`[data-order-down="${summer.id}"]`).click();await b.locator(`[data-order-up="${summer.id}"]`).click();assert.equal((await b.locator('[data-order-row]').evaluateAll(nodes=>nodes.map(n=>n.dataset.orderRow)))[1],summer.id);assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await b.locator('#term-order-dialog .dialog-actions [data-close]').click();await b.setViewportSize({width:1440,height:1000});
  // Deleting a populated term preserves every course by explicitly moving it.
  await b.locator(`[data-delete-term="${summer.id}"]`).click();assert.equal(await b.locator('#confirm-delete-term').textContent(),'ย้ายวิชาและลบเทอม');
  await b.locator('#delete-term-dialog .dialog-actions [data-close]').click();assert.equal(await b.locator(`[data-term="${summer.id}"]`).count(),1);
  await b.locator(`[data-delete-term="${summer.id}"]`).click();await b.locator('#delete-term-form [name=destination]').selectOption('t1');await b.locator('#confirm-delete-term').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  const afterDelete=(await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data;
  const expectedDelete=structuredClone(orderAfter);expectedDelete.terms=expectedDelete.terms.filter(t=>t.id!==summer.id);expectedDelete.courses=expectedDelete.courses.map(c=>c.term===summer.id?{...c,term:'t1'}:c);assert.deepEqual(afterDelete,expectedDelete);
  assert.equal(await b.locator(`[data-term="${summer.id}"]`).count(),0);assert.equal(await b.locator('#stats .stat-value').first().textContent(),globalBefore);
  // A regular term in a new year gets its own row, and an empty term can be removed.
  await b.locator('#add-term').click();await b.locator('#term-form [name=kind]').selectOption('regular');await b.locator('#term-form [name=year]').fill('5');assert.equal(await b.locator('#term-form [name=name]').inputValue(),'ปี 5 / เทอม 1');
  await b.locator('#term-form button[type=submit]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  const emptyTerm=await b.locator('[data-planner-year="5"] .term').getAttribute('data-term');await b.locator(`[data-delete-term="${emptyTerm}"]`).click();assert.equal(await b.locator('#delete-term-destination').isVisible(),false);await b.locator('#confirm-delete-term').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.deepEqual((await admin.from('study_plans').select('data').eq('user_id',ids[0]).single()).data.data,afterDelete);
  await b.reload();await b.locator('#app-main').waitFor({state:'visible'});assert.equal(await b.locator(`[data-term="${summer.id}"]`).count(),0);
  await b.locator('#logout').click(); await b.locator('#account-screen').waitFor({ state: 'visible' });
  await login(b, accounts[1]);
  assert.equal(await b.locator('[data-grade=c0]').inputValue(), '');
  assert.equal(await b.locator('.course').count(),52);
  const newPlan=(await admin.from('study_plans').select('data').eq('user_id',ids[1]).single()).data.data;
  assert.deepEqual(newPlan,SEED,'new accounts must receive the image-based curriculum, not the legacy Excel plan');
  assert.equal(await b.locator('[data-term=t0] [data-course=c12]').count(),1);
  assert.equal(await b.locator('[data-term=t1] [data-course=c0]').count(),1);
  assert.equal(await b.locator('[data-term=t2] [data-course=c34]').count(),1);
  assert.equal(await b.locator('[data-term=t3] [data-course=c41]').count(),1);
  const accent=await b.locator('[data-course=c23]').evaluate(el=>el.style.getPropertyValue('--category'));
  assert.equal(accent,SEED.courses.find(c=>c.id==='c23').accentColor);

  // Test row isolation over real PostgREST with a regular user's access token.
  const clientB = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await clientB.auth.signInWithPassword({ email: usernameEmail(accounts[1]), password: await authPassword(password) });
  const leak = await clientB.from('study_plans').select('*').eq('user_id', ids[0]);
  assert.ifError(leak.error); assert.deepEqual(leak.data, []);
  const attempt = await clientB.from('study_plans').update({ data: {} }).eq('user_id', ids[0]).select();
  assert.ifError(attempt.error); assert.deepEqual(attempt.data, []);
  const guest = createClient(url, anon, { auth: { persistSession: false } });
  assert.ok((await guest.from('study_plans').select('*')).error);
  // Reproduce the reported confusion: old extraCredits=108 must not count as a real achieved GPAX.
  const scenario=structuredClone(SEED);
  scenario.courses=[...Array.from({length:3},()=>({credits:13,grade:'A'})),...Array.from({length:7},()=>({credits:14,grade:'B'}))].map((c,i)=>({id:'scenario-'+i,name:'Test course '+i,code:'',category:'core',term:'t8',isGenEd:false,verify:false,note:'',...c}));
  scenario.honors={target:3.6,extraCredits:108,pendingGpa:4,additionalGpa:4};
  const ownRow=await clientB.from('study_plans').select('revision').eq('user_id',ids[1]).single();assert.ifError(ownRow.error);
  const scenarioSave=await clientB.rpc('save_study_plan',{plan_data:scenario,expected_revision:ownRow.data.revision});assert.ifError(scenarioSave.error);
  await b.reload();await b.locator('#app-main').waitFor({state:'visible'});await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await b.locator('.honors-panel select').count(),0);assert.equal(await b.locator('.honors-panel input').count(),1);
  assert.ok((await b.locator('[data-honors-target="3.6"]').textContent()).includes('GPAX จริงยังต่ำกว่าเป้า'));
  assert.ok((await b.locator('[data-recommendation="all-a"] .recommended-count').textContent()).includes('เพิ่ม 36 วิชา'));
  assert.ok((await b.locator('[data-recommendation="all-a"] .extra-targets').textContent()).includes('วิชาละ 3 หน่วยกิต'));
  assert.equal(await b.locator('[data-recommendation="all-a"] .recommended-result strong').textContent(),'3.6000');
  await b.locator('.honors-panel').screenshot({path:'/tmp/grade-garden-automatic-plans.png'});
  await b.setViewportSize({width:390,height:844});assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const untouched=await clientB.from('study_plans').select('data').eq('user_id',ids[1]).single();assert.deepEqual(untouched.data.data,scenario);
  assert.equal(await b.locator('[data-honors-target]').count(),3);
  const gpaxBeforeCustom=await b.locator('#stats .stat-value').first().textContent();
  await b.locator('#custom-gpax').fill('3.40');await b.locator('#custom-gpax-form button[type=submit]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await b.locator('[data-honors-target="custom"]').getAttribute('aria-pressed'),'true');
  assert.ok((await b.locator('[data-recommendation="all-a"] .recommended-count').textContent()).includes('เพิ่ม 9 วิชา'));
  assert.equal(await b.locator('[data-recommendation="all-a"] .recommended-result strong').textContent(),'3.4024');
  assert.equal(await b.locator('#stats .stat-value').first().textContent(),gpaxBeforeCustom);
  const customSaved=await clientB.from('study_plans').select('data').eq('user_id',ids[1]).single();const expectedCustom=structuredClone(scenario);expectedCustom.honors={...scenario.honors,target:3.4,mode:'custom',customTarget:3.4};assert.deepEqual(customSaved.data.data,expectedCustom);
  // Invalid or blank targets cannot replace a previously saved valid choice.
  for(const value of ['5','-1','']){await b.locator('#custom-gpax').fill(value);await b.locator('#custom-gpax-form button[type=submit]').click();assert.equal(await b.locator('#custom-gpax').evaluate(el=>el.checkValidity()),false);assert.deepEqual((await clientB.from('study_plans').select('data').eq('user_id',ids[1]).single()).data.data,expectedCustom);}
  await b.locator('#custom-gpax').fill('4');await b.locator('#custom-gpax-form button[type=submit]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.ok((await b.locator('#honors-recommendations').textContent()).includes('ไปไม่ถึงด้วยการลงเพิ่ม'));assert.equal(await b.locator('[data-recommendation]').count(),0);
  await b.locator('#custom-gpax').fill('3.25');await b.locator('#custom-gpax').press('Enter');await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.equal(await b.locator('[data-honors-target="custom"]').getAttribute('aria-pressed'),'true');assert.equal(await b.locator('[data-honors-target="3.25"]').getAttribute('aria-pressed'),'false');
  await b.locator('[data-honors-target="3.6"]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');assert.equal(await b.locator('#custom-gpax').inputValue(),'3.25');
  await b.locator('#custom-gpax').fill('3.40');await b.locator('#custom-gpax-form button[type=submit]').click();await b.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await b.setViewportSize({width:1440,height:1000});await b.locator('.honors-panel').screenshot({path:'/tmp/grade-garden-custom-gpax.png'});
  await b.reload();await b.locator('#app-main').waitFor({state:'visible'});assert.equal(await b.locator('#custom-gpax').inputValue(),'3.40');assert.equal(await b.locator('[data-honors-target="custom"]').getAttribute('aria-pressed'),'true');
  const third=await browser.newContext(),thirdPage=await third.newPage();await login(thirdPage,accounts[1]);assert.equal(await thirdPage.locator('#custom-gpax').inputValue(),'3.40');assert.equal(await thirdPage.locator('[data-honors-target="custom"]').getAttribute('aria-pressed'),'true');await third.close();
  assert.deepEqual((await clientB.from('study_plans').select('data').eq('user_id',ids[1]).single()).data.data,expectedCustom);
  assert.deepEqual(errors, []);
  console.log('PASS LIVE: regular/summer creation, horizontal year grouping/scroll retention, mouse/touch/keyboard reorder, scrollable mobile editor, cancel, safe empty/populated term deletion, reload persistence, custom GPAX/validation/4.00 feasibility, preserved grades and cross-device account isolation.');
} finally {
  await browser?.close();
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('Test account cleanup failed for ID', id);
  }
  console.log('Temporary smoke accounts removed.');
}
