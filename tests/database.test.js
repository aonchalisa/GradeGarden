import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { SEED } from '../src/seed.js';

test('PostgreSQL RLS isolates users, denies anonymous access and rejects stale saves', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611060001_study_plans.sql', import.meta.url), 'utf8'));
    const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users(id) values ($1),($2)', [alice, bob]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
    let result = await db.query('select * from public.save_study_plan($1::jsonb, null)', [JSON.stringify(SEED)]); assert.equal(Number(result.rows[0].revision), 1);
    const alicePlan = structuredClone(SEED); alicePlan.courses[0].grade = 'A';
    await db.query('select * from public.save_study_plan($1::jsonb, 1)', [JSON.stringify(alicePlan)]);
    await assert.rejects(db.query('select * from public.save_study_plan($1::jsonb, 1)', [JSON.stringify(SEED)]), e => e.code === 'P0001');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [bob]);
    assert.equal((await db.query('select * from public.study_plans')).rows.length, 0);
    await assert.rejects(db.query('insert into public.study_plans(user_id,data) values($1,$2::jsonb)', [alice, JSON.stringify(SEED)]), e => e.code === '42501');
    assert.equal((await db.query('update public.study_plans set data=$1::jsonb where user_id=$2 returning *', [JSON.stringify(SEED), alice])).rows.length, 0);
    await db.query('select * from public.save_study_plan($1::jsonb, null)', [JSON.stringify(SEED)]);
    assert.equal((await db.query('select * from public.study_plans')).rows.length, 1);
    assert.equal((await db.query('select * from public.study_plans')).rows[0].user_id, bob);
    await assert.rejects(db.query('select * from public.save_study_plan($1::jsonb, 1)', [JSON.stringify({})]), e => e.code === '23514');
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.study_plans'), e => e.code === '42501');
    await assert.rejects(db.query('select * from public.save_study_plan($1::jsonb,null)', [JSON.stringify(SEED)]), e => e.code === '42501');
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(db.query('select * from public.save_study_plan($1::jsonb,null)', [JSON.stringify(SEED)]), e => e.code === '42501');
  } finally { await db.close(); }
});
