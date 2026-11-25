import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeSpa, SPA_HOST, SPA_ID, settle } from './helpers/fakeSpa.js';
import { scanned, setup, teardown } from './helpers/setup.js';
import { FEATURES, idsOf, platformIdOf } from '../src/devices/spa.js';
import { TRIGGERS } from '../src/spaManager.js';

test('a scan finds the spa through Gladys and publishes a valid device', async () => {
  const context = await scanned();
  try {
    const { gladys } = context;
    assert.deepEqual(gladys.fake.scans.at(-1).type, 'udp-active-broadcast');
    const [device] = gladys.fake.discoveredDevices;
    assert.equal(device.name, 'Garden spa');
    assert.equal(device.external_id, `ext:test-integration:spa:${platformIdOf(SPA_ID)}`);
    assert.deepEqual(
      device.params.find((param) => param.name === 'IP_ADDRESS'),
      { name: 'IP_ADDRESS', value: SPA_HOST },
    );
    const keys = device.features.map((feature) => feature.external_id.split(':').at(-1));
    assert.deepEqual(keys, [
      'water-temperature',
      'target-temperature',
      'heating',
      'p1',
      'p2',
      'bl',
      'li',
      'cp',
      'o3',
      'watercare',
      'signal',
    ]);
  } finally {
    teardown(context);
  }
});

test('every feature carries the columns Gladys stores NOT NULL', async () => {
  const context = await scanned();
  try {
    for (const feature of context.gladys.fake.discoveredDevices[0].features) {
      for (const column of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[column], undefined, `${feature.external_id}: ${column}`);
      }
    }
  } finally {
    teardown(context);
  }
});

test('the states of the spa are published', async () => {
  const context = await scanned();
  try {
    const { gladys } = context;
    const ids = idsOf(gladys, SPA_ID);
    assert.equal(gladys.fake.lastState(ids.feature(FEATURES.WATER_TEMPERATURE)), 30.5);
    assert.equal(gladys.fake.lastState(ids.feature(FEATURES.TARGET_TEMPERATURE)), 37);
    assert.equal(gladys.fake.lastState(ids.feature('p1')), 0);
    assert.equal(gladys.fake.lastState(ids.feature(FEATURES.SIGNAL)), 87);
    assert.deepEqual(gladys.fake.transports.at(-1), {
      device_external_id: ids.device,
      transport: 'local',
    });
  } finally {
    teardown(context);
  }
});

test('the device commands reach the spa', async () => {
  const context = await scanned();
  try {
    const { gladys, spas } = context;
    const [spa] = spas;
    const [device] = gladys.fake.discoveredDevices;
    const feature = (key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));

    assert.equal((await gladys.fake.setValue(device, feature('p1'), 1)).success, true);
    assert.equal(spa.block.readUInt8(spa.accessor('UdP1').pos) & 0b11, 2, 'pump 1 on high');

    assert.equal(
      (await gladys.fake.setValue(device, feature('target-temperature'), 38.5)).success,
      true,
    );
    assert.equal(spa.block.readUInt16BE(spa.accessor('SetpointG').pos), 693);

    assert.equal(
      (await gladys.fake.setValue(device, feature('watercare'), 'weekender')).success,
      true,
    );
    assert.equal(spa.watercare, 4);

    const refused = await gladys.fake.setValue(device, feature('cp'), 1);
    assert.equal(refused.success, false, 'an indicator cannot be controlled');
  } finally {
    teardown(context);
  }
});

test('transitions fire the scene triggers', async () => {
  const context = await scanned();
  try {
    const { gladys, spas, manager } = context;
    const [spa] = spas;
    const entry = manager.spas.get(SPA_ID);

    spa.push('Heating', () => spa.set('Heating', 'Heating'));
    await settle();
    await manager.publishStates(entry);
    spa.push('DisplayedTempG', () => spa.setTemperature('DisplayedTempG', 37));
    await settle();
    await manager.publishStates(entry);

    const events = gladys.fake.sceneEvents.map(({ key, data }) => ({ key, data }));
    const device = idsOf(gladys, SPA_ID).device;
    assert.deepEqual(events, [
      { key: TRIGGERS.HEATING_CHANGED, data: { device, state: 'started', temperature: 30.5 } },
      {
        key: TRIGGERS.TEMPERATURE_REACHED,
        data: { device, temperature: 37, target_temperature: 37 },
      },
    ]);
  } finally {
    teardown(context);
  }
});

test('a lost spa is reported unreachable and fires the connection trigger', async () => {
  const context = await scanned();
  try {
    const { gladys, spas, manager } = context;
    const entry = manager.spas.get(SPA_ID);
    spas[0].online = false;
    entry.client.timings.pingLossMs = 0;
    await entry.client.ping();
    await entry.pending;
    assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
    assert.equal(gladys.fake.connectionStatus.connected, false);
    assert.equal(gladys.fake.sceneEvents.at(-1).key, TRIGGERS.CONNECTION_CHANGED);
    assert.equal(gladys.fake.sceneEvents.at(-1).data.state, 'lost');
  } finally {
    teardown(context);
  }
});

test('a spa found before is reconnected at startup, without a scan', async () => {
  const first = await scanned();
  teardown(first);
  const spa = new FakeSpa();
  const context = await setup({ spas: [spa] });
  try {
    Object.assign(context.store.state.spas, first.store.spas);
    await context.manager.start();
    assert.equal(context.manager.spas.get(SPA_ID).client.connected, true);
    assert.equal(context.gladys.fake.scans.length, 0);
    assert.equal(context.manager.buildDevices().length, 1);
  } finally {
    teardown(context);
  }
});

test('the configured address is probed when the broadcast finds nothing', async () => {
  const context = await setup({ config: { spa_host: SPA_HOST } });
  try {
    context.gladys.fake.scanResults = { 'udp-active-broadcast': [] };
    const found = await context.manager.scan();
    assert.deepEqual(
      found.map((spa) => spa.spaId),
      [SPA_ID],
    );
  } finally {
    teardown(context);
  }
});
