const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const rows = new Map();
const accounts = {
  'alice@example.com': '11111111-1111-4111-8111-111111111111',
  'bob@example.com': '22222222-2222-4222-8222-222222222222',
};
const tokenFor = id => `${Buffer.from(JSON.stringify({ alg:'HS256',typ:'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.testsignature`;
const userFor = email => ({id:accounts[email],email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:new Date().toISOString()});
const session = email => ({ access_token:tokenFor(accounts[email]),refresh_token:'test-refresh-'+email,expires_in:3600,token_type:'bearer',user:userFor(email) });
const browserErrors=[];
async function mock(context) {
  await context.route('https://gradegarden-test.supabase.co/**', async route => {
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'x-supabase-api-version':'2024-01-01','access-control-allow-origin':'*','access-control-expose-headers':'X-Supabase-Api-Version'},body:JSON.stringify(body)});
    if(req.method()==='OPTIONS')return route.fulfill({status:204});
    if(path==='/auth/v1/token') { const data=req.postDataJSON(); if(data.password==='bad-password')return json({code:'invalid_credentials',error_code:'invalid_credentials',msg:'Invalid login credentials'},400); return json(session(data.email||'alice@example.com')); }
    if(path==='/auth/v1/signup')return json(userFor('bob@example.com'));
    if(path==='/auth/v1/recover')return json({});
    if(path==='/auth/v1/logout')return route.fulfill({status:204});
    let id;try{id=JSON.parse(Buffer.from(req.headers().authorization.split('.')[1],'base64url').toString()).sub;}catch{}
    if(path==='/auth/v1/user')return json(userFor(Object.keys(accounts).find(e=>accounts[e]===id)));
    if(path==='/rest/v1/study_plans')return json(rows.get(id)||null);
    if(path==='/rest/v1/rpc/save_study_plan') { const body=req.postDataJSON(),prev=rows.get(id); if((prev?.revision??null)!==body.expected_revision)return json({code:'P0001',message:'conflict'},400);const row={data:body.plan_data,revision:(prev?.revision||0)+1};rows.set(id,row);return json([{revision:row.revision,updated_at:new Date().toISOString()}]); }
    return json({error:'unmocked '+path},404);
  });
}
async function login(page,email) {
  await page.goto('http://127.0.0.1:4175');
  await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill('test-password');await page.locator('#auth-submit').click();
  await page.locator('#app-main').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
}
(async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
 try {
  const a=await browser.newContext({viewport:{width:1440,height:1000}});await mock(a);const page=await a.newPage();page.on('pageerror',e=>browserErrors.push(e.message));
  await page.goto('http://127.0.0.1:4175');await page.locator('[data-mode=signup]').click();await page.locator('[name=email]').fill('bob@example.com');await page.locator('[name=password]').fill('test-password');await page.locator('#auth-submit').click();await page.getByText('ตรวจอีเมลเพื่อยืนยันบัญชี', {exact:false}).waitFor();
  await page.locator('[data-mode=login]').click();await page.locator('[name=password]').fill('bad-password');await page.locator('#auth-submit').click();await page.getByText('อีเมลหรือรหัสผ่านไม่ถูกต้อง',{exact:true}).waitFor({timeout:10000});console.log('auth errors verified');
  await page.locator('#forgot-password').click();await page.locator('#auth-submit').click();await page.getByText('หากมีบัญชีนี้',{exact:false}).waitFor();await page.locator('#back-login').click();
  await login(page,'alice@example.com');assert.equal(await page.locator('.course').count(),52);assert.equal(await page.locator('[data-grade=c0]').inputValue(),'');
  await page.locator('[data-grade=c0]').selectOption('A');await page.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');assert.equal(rows.get(accounts['alice@example.com']).data.courses[0].grade,'A');
  // A second device starts from the cloud, without sharing localStorage.
  const b=await browser.newContext();await mock(b);const device=await b.newPage();await login(device,'alice@example.com');assert.equal(await device.locator('[data-grade=c0]').inputValue(),'A');
  await device.locator('[data-grade=c0]').selectOption('B');await device.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  await page.locator('[data-grade=c0]').selectOption('D');await page.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='conflict');assert.equal(rows.get(accounts['alice@example.com']).data.courses[0].grade,'B');
  page.once('dialog',d=>d.accept());await page.locator('#sync-reload').click();await page.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');assert.equal(await page.locator('[data-grade=c0]').inputValue(),'B');
  await page.locator('[data-edit=c0]').click();await page.locator('[name=term]').selectOption('t1');await page.locator('#course-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');assert.equal(await page.locator('[data-term=t1] [data-course=c0]').count(),1);
  await page.locator('[data-course=c0]').dragTo(page.locator('[data-term=t0] .term-head'));await page.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');assert.equal(await page.locator('[data-term=t0] [data-course=c0]').count(),1);
  await page.locator('#logout').click();await page.locator('#account-screen').waitFor({state:'visible'});assert.equal(await page.locator('#app-main').isVisible(),false);
  await login(page,'bob@example.com');assert.equal(await page.locator('[data-grade=c0]').inputValue(),'');
  await page.locator('#logout').click();await page.locator('#account-screen').waitFor({state:'visible'});
  await page.locator('#forgot-password').click();await page.locator('[name=email]').fill('alice@example.com');await page.locator('#auth-submit').click();await page.getByText('หากมีบัญชีนี้',{exact:false}).waitFor();
  await page.goto('http://127.0.0.1:4175/?code=test-recovery-code');await page.getByText('ตั้งรหัสผ่านใหม่',{exact:true}).waitFor();await page.locator('[name=password]').fill('new-password');await page.locator('#auth-submit').click();await page.locator('#app-main').waitFor({state:'visible'});await page.locator('#logout').click();await page.locator('#account-screen').waitFor({state:'visible'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/grade-garden-login.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await login(page,'alice@example.com');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('[data-edit=c0]').click();await page.locator('[name=term]').selectOption('t1');await page.locator('#course-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#save-status').dataset.kind==='saved');
  assert.deepEqual(browserErrors,[]);console.log('PASS browser: signup email confirmation, invalid credentials, password reset, login, autosave, second-device load, revision conflict/reload, drag, mobile move, logout, account isolation. Supabase endpoints mocked; SQL RLS tested separately.');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
