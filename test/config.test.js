import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('an empty config falls back to the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('the module address is trimmed and validated', () => {
  assert.equal(normalizeConfig({ spa_host: ' 192.168.1.50 ' }).spa_host, '192.168.1.50');
  assert.equal(normalizeConfig({ spa_host: 'spa.local' }).spa_host, 'spa.local');
  assert.equal(normalizeConfig({ spa_host: '999.1.1.1' }).spa_host, '');
  assert.equal(normalizeConfig({ spa_host: 'http://x/y' }).spa_host, '');
});
