// Scene actions, dashboard widget and Configuration screen actions, through
// the SDK's fake Gladys (gladys.fake.sceneAction / widgetGet / action...).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { SPA_ID, settle } from './helpers/fakeSpa.js';
import { scanned, setup, teardown } from './helpers/setup.js';
import { idsOf } from '../src/devices/spa.js';
import { SPA_OVERVIEW_WIDGET } from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const outputsOf = (key) =>
  manifest.scene_actions.find((action) => action.key === key).outputs.map((o) => o.key);

function assertTranslated(message) {
  for (const language of LANGUAGES) {
    assert.ok(message?.[language], `missing ${language} text in ${JSON.stringify(message)}`);
  }
}

test('scene actions control the spa and resolve their declared outputs', async () => {
  const context = await scanned();
  try {
    const { gladys, spas } = context;
    const [spa] = spas;
    const device = idsOf(gladys, SPA_ID).device;

    let ack = await gladys.fake.sceneAction('set_target_temperature', {
      device,
      temperature: 39,
    });
    assert.deepEqual(ack.data.outputs, { target_temperature: 39 });
    assert.equal(spa.block.readUInt16BE(spa.accessor('SetpointG').pos), 702);

    ack = await gladys.fake.sceneAction('set_watercare_mode', { device, mode: 'energy_saving' });
    assert.deepEqual(ack.data.outputs, { mode: 'energy_saving' });

    ack = await gladys.fake.sceneAction('set_equipment', { device, equipment: 'P1', speed: 'LO' });
    assert.deepEqual(ack.data.outputs, { applied: true });
    assert.equal(spa.block.readUInt8(spa.accessor('UdP1').pos) & 0b11, 1);

    ack = await gladys.fake.sceneAction('set_equipment', { device, equipment: 'P5', speed: 'HI' });
    assert.deepEqual(ack.data.outputs, { applied: false }, 'no pump 5: an output, not a failure');

    ack = await gladys.fake.sceneAction('stop_all', { device });
    assert.deepEqual(ack.data.outputs, { stopped: 1 });

    for (const key of [
      'set_target_temperature',
      'set_watercare_mode',
      'set_equipment',
      'stop_all',
    ]) {
      assert.ok(outputsOf(key).length > 0, `${key} declares outputs`);
    }
  } finally {
    teardown(context);
  }
});

test('the widget content is rendered exactly as sent', async () => {
  const context = await scanned();
  try {
    const { gladys } = context;
    const ack = await gladys.fake.widgetGet(SPA_OVERVIEW_WIDGET, { settings: {} });
    assert.equal(ack.success, true);
    // [] = nothing the core would drop, truncate or trim.
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    const types = ack.data.content.components.map((component) => component.type);
    assert.deepEqual(types, ['value', 'value', 'status', 'button', 'button', 'button']);
  } finally {
    teardown(context);
  }
});

test('the widget shows an empty state before any spa is found', async () => {
  const context = await setup({ spas: [] });
  try {
    const ack = await context.gladys.fake.widgetGet(SPA_OVERVIEW_WIDGET, { settings: {} });
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    assert.equal(ack.data.content.components[0].type, 'text');
  } finally {
    teardown(context);
  }
});

test('every widget button is handled and answers a translated toast', async () => {
  const context = await scanned();
  try {
    const { gladys } = context;
    const { content } = (await gladys.fake.widgetGet(SPA_OVERVIEW_WIDGET, { settings: {} })).data;
    const buttons = content.components.filter((component) => component.type === 'button');
    for (const { action } of buttons) {
      const values = action.fields ? { temperature: 38 } : undefined;
      const ack = await gladys.fake.widgetAction(SPA_OVERVIEW_WIDGET, action.key, action.params, {
        settings: {},
        values,
      });
      assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
      assertTranslated(ack.data?.message ?? ack.data);
    }
  } finally {
    teardown(context);
  }
});

test('the scan action reports the spas found, in every language', async () => {
  const context = await setup();
  try {
    const ack = await context.gladys.fake.action('scan', {});
    assert.equal(ack.success, true);
    const message = ack.data?.message ?? ack.data;
    assertTranslated(message);
    assert.match(message.en, /1 spa\(s\) found: Garden spa \(192\.168\.1\.50\)/);
    assert.equal(context.gladys.fake.discoveredDevices.length, 1);
  } finally {
    teardown(context);
  }
});

test('the test and identify actions answer in every language', async () => {
  const context = await scanned();
  try {
    const { gladys, manager } = context;
    let ack = await gladys.fake.action('test_connection', {});
    assertTranslated(ack.data?.message ?? ack.data);
    assert.match((ack.data?.message ?? ack.data).en, /Garden spa: connected \(87 %\)/);

    const entry = manager.spas.get(SPA_ID);
    const identify = manager.identify.bind(manager);
    manager.identify = (target) => identify(target, { delayMs: 0 });
    ack = await gladys.fake.action('identify', { device: idsOf(gladys, SPA_ID).device });
    assertTranslated(ack.data?.message ?? ack.data);
    await settle();
    assert.equal(entry.client.snapshot().equipment.LI, 'OFF', 'the light ends as it started');
  } finally {
    teardown(context);
  }
});
