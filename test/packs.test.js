import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_PLATFORMS,
  UnsupportedSpaError,
  celsiusToRaw,
  encodeWrite,
  loadPack,
  rawToCelsius,
  readValue,
} from '../src/gecko/packs.js';
import { capabilitiesOf, snapshotOf, modeForSpeed, onModeOf } from '../src/gecko/model.js';
import { FakeSpa } from './helpers/fakeSpa.js';

test('the common Gecko platforms are supported', () => {
  for (const platform of ['inyt', 'inxe', 'inyj', 'inxm', 'inye-v3']) {
    assert.ok(SUPPORTED_PLATFORMS.includes(platform), platform);
  }
});

test('an unknown platform or version is reported as unsupported', () => {
  assert.throws(() => loadPack('nope', 1, 1), UnsupportedSpaError);
  assert.throws(() => loadPack('inyt', 1, 1), UnsupportedSpaError);
});

test('every supported memory map exposes the water temperature and setpoint', () => {
  // The two things every spa owner expects: the maps that lack them would
  // publish a spa without its heater.
  for (const platform of SUPPORTED_PLATFORMS) {
    const pack = loadPack(platform, ...firstVersions(platform));
    assert.ok(pack.accessors.SetpointG, `${platform}: SetpointG`);
    assert.ok(pack.packType > 0, `${platform}: pack type`);
  }
});

function firstVersions(platform) {
  for (let config = 0; config < 100; config += 1) {
    for (let log = 0; log < 100; log += 1) {
      try {
        loadPack(platform, config, log);
        return [config, log];
      } catch {
        // Keep looking.
      }
    }
  }
  throw new Error(`No version for ${platform}`);
}

test('temperatures are tenths of °F above freezing', () => {
  assert.equal(rawToCelsius(666), 37);
  assert.equal(celsiusToRaw(37), 666);
  assert.equal(celsiusToRaw(38.5), 693);
});

test('an enum packed in a few bits is read and written without touching its neighbours', () => {
  const spa = new FakeSpa();
  const pump = spa.accessor('UdP1');
  spa.block.writeUInt8(0b1111_0000, pump.pos);
  const write = encodeWrite(spa.block, pump, 'HI');
  assert.equal(write.data.readUInt8(0) & 0b1111_0000, 0b1111_0000, 'other bits kept');
  write.data.copy(spa.block, write.pos);
  assert.equal(readValue(spa.block, pump), 'HI');
  assert.throws(() => encodeWrite(spa.block, pump, 'TURBO'), /cannot be set/);
  assert.throws(() => encodeWrite(spa.block, spa.accessor('P1'), 'HIGH'), /read-only/);
});

test('the capabilities follow the equipment wired to the outputs', () => {
  const spa = new FakeSpa({ equipment: ['P1H', 'P1L', 'P2H', 'BLO', 'LI', 'CP'] });
  const capabilities = capabilitiesOf(spa.pack, spa.block);
  assert.deepEqual(
    capabilities.equipment.map((item) => item.key),
    ['P1', 'P2', 'BL', 'LI'],
  );
  assert.deepEqual(
    capabilities.indicators.map((item) => item.key),
    ['CP'],
  );
  assert.equal(capabilities.heater, true);
  assert.equal(capabilities.canSetTemperature, true);
  assert.equal(capabilities.minSetpoint, 15);
  assert.equal(capabilities.maxSetpoint, 40);

  const pump1 = capabilities.equipment[0];
  assert.deepEqual(pump1.modes, ['OFF', 'LO', 'HI']);
  assert.equal(onModeOf(pump1), 'HI');
  assert.equal(modeForSpeed(pump1, 'LO'), 'LO');
  const light = capabilities.equipment.find((item) => item.kind === 'light');
  assert.equal(onModeOf(light), 'HI');
});

test('the snapshot reads temperatures, heating and the equipment', () => {
  const spa = new FakeSpa();
  spa.set('UdP1', 'LO');
  spa.set('Heating', 'Heating');
  const capabilities = capabilitiesOf(spa.pack, spa.block);
  const snapshot = snapshotOf(spa.pack, spa.block, capabilities);
  assert.equal(snapshot.waterTemperature, 30.5);
  assert.equal(snapshot.targetTemperature, 37);
  assert.equal(snapshot.heating, true);
  assert.equal(snapshot.equipment.P1, 'LO');
  assert.equal(snapshot.equipment.P2, 'OFF');
});
