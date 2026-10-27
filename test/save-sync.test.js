import assert from 'node:assert/strict';
import test from 'node:test';
import { pickSave, readRev } from '../src/save-sync.js';

function save(totalEarned, rev = 0) {
  return { v: 2, totalEarned, rev, businesses: [] };
}

test('rev ausente conta como zero', () => {
  assert.equal(readRev(null), 0);
  assert.equal(readRev({ rev: 3 }), 3);
  assert.equal(readRev({ rev: 1.5 }), 0);
});

test('save mais rico de carreira ganha', () => {
  const local = save(100, 1);
  const cloud = save(50, 9);
  assert.deepEqual(pickSave(local, cloud), { source: 'local', save: local });
  assert.deepEqual(pickSave(cloud, local), { source: 'cloud', save: local });
});

test('empate de carreira usa o rev e depois a nuvem', () => {
  const local = save(80, 4);
  const cloud = save(80, 2);
  assert.equal(pickSave(local, cloud).source, 'local');
  assert.equal(pickSave(save(80, 2), save(80, 4)).source, 'cloud');
  assert.equal(pickSave(save(80, 4), save(80, 4)).source, 'cloud');
});

test('lado vazio ou inválido perde', () => {
  const local = save(10, 1);
  assert.equal(pickSave(local, null).source, 'local');
  assert.equal(pickSave(null, local).source, 'cloud');
  assert.equal(pickSave(null, null).source, 'none');
  assert.equal(pickSave({ v: 3, totalEarned: 999, businesses: [] }, local).source, 'cloud');
  assert.equal(pickSave(local, { v: 2, totalEarned: -1, businesses: [] }).source, 'local');
});
