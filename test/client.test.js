import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeckoSpaClient } from '../src/gecko/client.js';
import { encodeDemand, encodeSetpoint } from '../src/gecko/model.js';
import { FakeSpa, SPA_HOST, SPA_ID, settle } from './helpers/fakeSpa.js';

const FAST = {
  requestTimeoutMs: 200,
  statusBlockTimeoutMs: 400,
  retries: 2,
  pingIntervalMs: 60_000,
  resyncIntervalMs: 60_000,
  channelIntervalMs: 60_000,
};

async function connectedClient(spa = new FakeSpa()) {
  const client = new GeckoSpaClient({
    host: SPA_HOST,
    spaId: SPA_ID,
    clientId: 'IOStest',
    createSocket: () => spa.createSocket(),
    timings: FAST,
  });
  await client.connect();
  return { client, spa };
}

test('connects with the same sequence as the official app', async () => {
  const { client, spa } = await connectedClient();
  try {
    assert.equal(client.connected, true);
    assert.deepEqual(spa.received.slice(0, 5), ['AVERS', 'CURCH', 'SFILE', 'STATU', 'GETWC']);
    assert.equal(client.versions.en, '88 v3.0');
    assert.equal(client.channel.signal, 87);
    assert.equal(client.watercareMode, 'standard');
    assert.deepEqual(client.block.subarray(0, 512), spa.block.subarray(0, 512));
    const snapshot = client.snapshot();
    assert.equal(snapshot.waterTemperature, 30.5);
    assert.equal(snapshot.targetTemperature, 37);
  } finally {
    client.close();
  }
});

test('a write reaches the spa memory and is reflected locally', async () => {
  const { client, spa } = await connectedClient();
  try {
    const pump = client.capabilities.equipment.find((item) => item.key === 'P1');
    await client.write(encodeDemand(client.pack, client.block, pump, 'HI'));
    await settle();
    assert.equal(client.snapshot().equipment.P1, 'HI');
    assert.equal(spa.block.readUInt8(spa.accessor('UdP1').pos) & 0b11, 2);

    const write = encodeSetpoint(client.pack, client.block, client.capabilities, 45);
    assert.equal(write.value, 40, 'clamped to the spa maximum');
    await client.write(write);
    assert.equal(client.snapshot().targetTemperature, 40);
  } finally {
    client.close();
  }
});

test('pushed changes are acknowledged and applied', async () => {
  const { client, spa } = await connectedClient();
  try {
    let updates = 0;
    client.on('update', () => {
      updates += 1;
    });
    spa.push('DisplayedTempG', () => spa.setTemperature('DisplayedTempG', 36.5));
    await settle();
    assert.equal(updates, 1);
    assert.equal(client.snapshot().waterTemperature, 36.5);
    assert.ok(spa.received.includes('STATQ'), 'the push is acknowledged');
  } finally {
    client.close();
  }
});

test('the watercare mode is set', async () => {
  const { client, spa } = await connectedClient();
  try {
    assert.equal(await client.setWatercareMode('away'), 'away');
    assert.equal(spa.watercare, 0);
    await assert.rejects(client.setWatercareMode('party'), /Unknown watercare mode/);
  } finally {
    client.close();
  }
});

test('a spa that does not answer fails the connection', async () => {
  const spa = new FakeSpa();
  spa.online = false;
  const client = new GeckoSpaClient({
    host: SPA_HOST,
    spaId: SPA_ID,
    clientId: 'IOStest',
    createSocket: () => spa.createSocket(),
    timings: FAST,
  });
  await assert.rejects(client.connect(), /No answer/);
  assert.equal(client.connected, false);
  client.close();
});

test('a spa that stops answering the pings is reported lost', async () => {
  const { client, spa } = await connectedClient();
  try {
    let lost = false;
    client.on('disconnected', () => {
      lost = true;
    });
    spa.online = false;
    client.timings.pingLossMs = 0;
    await client.ping();
    assert.equal(lost, true);
    assert.equal(client.connected, false);
    assert.throws(() => client.ensureConnected(), /not connected/);
  } finally {
    client.close();
  }
});
