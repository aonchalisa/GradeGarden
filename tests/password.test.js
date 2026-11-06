import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authPassword } from '../src/password.js';

test('four/five-character credentials have a stable representation; existing passwords are unchanged', async () => {
  const four = await authPassword('1234');
  assert.match(four, /^ggp1_[0-9a-f]{64}$/);
  assert.equal(four, await authPassword('1234'));
  assert.notEqual(four, await authPassword('1235'));
  assert.match(await authPassword('12345'), /^ggp1_[0-9a-f]{64}$/);
  for (const password of ['123456', 'a-longer-password', 'รหัสเดิม123']) assert.equal(await authPassword(password), password);
  assert.equal(await authPassword('123'), '123', 'invalid short inputs must not bypass the backend minimum');
});
