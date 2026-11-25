import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHelloBroadcast,
  buildPacket,
  parseConfigFile,
  parseHello,
  parsePacket,
  parseStatusPush,
  parseStatusSegment,
  parseVersion,
  parseWatercare,
  requests,
  verbOf,
} from '../src/gecko/protocol.js';

test('the HELLO broadcast is the one every in.touch2 module answers', () => {
  assert.equal(buildHelloBroadcast().toString(), '<HELLO>1</HELLO>');
});

test('a spa HELLO answer gives its identifier and name', () => {
  assert.deepEqual(parseHello(Buffer.from('<HELLO>SPA00:11:22:33:44:55|My spa</HELLO>')), {
    spaId: 'SPA00:11:22:33:44:55',
    name: 'My spa',
  });
  assert.deepEqual(parseHello(Buffer.from('<HELLO>SPA01</HELLO>')), {
    spaId: 'SPA01',
    name: 'Spa',
  });
});

test('broadcasts and other clients are not spas', () => {
  assert.equal(parseHello(Buffer.from('<HELLO>1</HELLO>')), null);
  assert.equal(parseHello(Buffer.from('<HELLO>IOSabc</HELLO>')), null);
  assert.equal(parseHello(Buffer.from('<HELLO>ANDabc</HELLO>')), null);
  assert.equal(parseHello(Buffer.from('garbage')), null);
});

test('a packet round-trips, binary payload included', () => {
  const payload = Buffer.from([0x53, 0x54, 0x41, 0x54, 0x56, 0x00, 0x3c, 0xff]);
  const parsed = parsePacket(buildPacket('IOSclient', 'SPA01', payload));
  assert.equal(parsed.source, 'IOSclient');
  assert.equal(parsed.destination, 'SPA01');
  assert.deepEqual(parsed.payload, payload);
  assert.equal(verbOf(parsed.payload), 'STATV');
  assert.equal(parsePacket(Buffer.from('<HELLO>1</HELLO>')), null);
});

test('requests are laid out as the spa expects', () => {
  assert.deepEqual(requests.ping(), Buffer.from('APING'));
  assert.deepEqual(requests.version(7), Buffer.concat([Buffer.from('AVERS'), Buffer.from([7])]));
  assert.deepEqual(
    requests.statusBlock(3, 0, 1024),
    Buffer.concat([Buffer.from('STATU'), Buffer.from([3, 0, 0, 4, 0])]),
  );
  assert.deepEqual(
    requests.setValue({
      seq: 200,
      packType: 10,
      configVersion: 87,
      logVersion: 83,
      pos: 259,
      data: Buffer.from([2]),
    }),
    Buffer.concat([Buffer.from('SPACK'), Buffer.from([200, 10, 6, 70, 87, 83, 1, 3, 2])]),
  );
  assert.deepEqual(
    requests.setWatercare(5, 2),
    Buffer.concat([Buffer.from('SETWC'), Buffer.from([5, 2])]),
  );
});

test('responses are parsed', () => {
  assert.deepEqual(parseVersion(Buffer.from([...Buffer.from('SVERS'), 0, 88, 3, 0, 0, 99, 2, 1])), {
    en: '88 v3.0',
    co: '99 v2.1',
  });
  assert.deepEqual(parseConfigFile(Buffer.from('FILES,inYT_C87.xml,inYT_S83.xml')), {
    platform: 'inyt',
    configVersion: 87,
    logVersion: 83,
  });
  assert.equal(parseConfigFile(Buffer.from('FILES,inYT_C87.xml,inXE_S60.xml')), null);
  const segment = parseStatusSegment(Buffer.from([...Buffer.from('STATV'), 0, 1, 2, 9, 8, 7]));
  assert.deepEqual({ ...segment, data: [...segment.data] }, { index: 0, next: 1, data: [9, 8] });
  const changes = parseStatusPush(
    Buffer.from([...Buffer.from('STATP'), 2, 1, 2, 0xaa, 0xbb, 0, 4, 0xcc, 0xdd]),
  );
  assert.deepEqual(
    changes.map(({ pos, data }) => [pos, [...data]]),
    [
      [258, [0xaa, 0xbb]],
      [4, [0xcc, 0xdd]],
    ],
  );
  assert.equal(parseWatercare(Buffer.from([...Buffer.from('WCGET'), 3])), 3);
});
