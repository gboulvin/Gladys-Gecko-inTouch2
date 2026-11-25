// -----------------------------------------------------------------------------
// An in-memory in.touch2 module, for the tests: it answers the protocol over a
// fake UDP socket, never the network.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { buildPacket, parsePacket, verbOf, STATUS_BLOCK_SIZE } from '../../src/gecko/protocol.js';
import { loadPack, celsiusToRaw } from '../../src/gecko/packs.js';

export const SPA_ID = 'SPA00:11:22:33:44:55';
export const SPA_NAME = 'Garden spa';
export const SPA_HOST = '192.168.1.50';
export const PLATFORM = { name: 'inYT', key: 'inyt', config: 87, log: 83 };

/** Write a raw value of an accessor in a block (bits included). */
export function setRaw(block, accessor, raw) {
  if (accessor.bitpos !== null) {
    const existing = block.readUInt8(accessor.pos);
    const value =
      (existing & ~(accessor.bitmask << accessor.bitpos)) |
      ((raw & accessor.bitmask) << accessor.bitpos);
    block.writeUInt8(value, accessor.pos);
  } else if (accessor.length === 2) {
    block.writeUInt16BE(raw, accessor.pos);
  } else {
    block.writeUInt8(raw, accessor.pos);
  }
}

export class FakeSpa {
  constructor({ host = SPA_HOST, spaId = SPA_ID, name = SPA_NAME, equipment } = {}) {
    this.host = host;
    this.spaId = spaId;
    this.name = name;
    this.pack = loadPack(PLATFORM.key, PLATFORM.config, PLATFORM.log);
    this.block = Buffer.alloc(STATUS_BLOCK_SIZE);
    this.watercare = 1;
    this.received = [];
    this.online = true;
    this.socket = null;
    this.client = null;
    this.wire(equipment ?? ['P1H', 'P1L', 'P2H', 'BLO', 'LI', 'CP', 'O3']);
    this.set('TempUnits', 'C');
    this.setTemperature('SetpointG', 37);
    this.setTemperature('DisplayedTempG', 30.5);
    this.setTemperature('RhWaterTemp', 30.5);
    this.setTemperature('MinSetpointG', 15);
    this.setTemperature('MaxSetpointG', 40);
  }

  /** Wire equipment to the relay outputs, e.g. ['P1H', 'LI']. */
  wire(connections) {
    const used = new Set();
    for (const connection of connections) {
      const name = this.pack.outputs.find(
        (output) => !used.has(output) && this.pack.accessors[output].items?.includes(connection),
      );
      if (!name) {
        throw new Error(`No output for ${connection}`);
      }
      used.add(name);
      const accessor = this.pack.accessors[name];
      setRaw(this.block, accessor, accessor.items.indexOf(connection));
    }
  }

  accessor(name) {
    const accessor = this.pack.accessors[name];
    if (!accessor) {
      throw new Error(`No accessor ${name}`);
    }
    return accessor;
  }

  set(name, label) {
    const accessor = this.accessor(name);
    const raw = accessor.items ? accessor.items.indexOf(label) : Number(label);
    setRaw(this.block, accessor, raw);
  }

  setTemperature(name, celsius) {
    setRaw(this.block, this.accessor(name), celsiusToRaw(celsius));
  }

  /** The fake UDP socket a client of this spa uses. */
  createSocket() {
    const socket = new EventEmitter();
    socket.bind = (_port, callback) => setImmediate(callback);
    socket.close = () => {
      socket.closed = true;
    };
    socket.send = (datagram, port, host) => {
      if (socket.closed || host !== this.host || !this.online) {
        return;
      }
      setImmediate(() => this.receive(datagram, socket));
    };
    this.socket = socket;
    return socket;
  }

  reply(socket, payload) {
    const datagram = buildPacket(this.spaId, this.client, payload);
    setImmediate(() => socket.emit('message', datagram, { address: this.host, port: 10022 }));
  }

  receive(datagram, socket) {
    const packet = parsePacket(datagram);
    if (!packet || packet.destination !== this.spaId) {
      return;
    }
    this.client = packet.source;
    const { payload } = packet;
    const verb = verbOf(payload);
    this.received.push(verb);
    const reply = (...parts) => this.reply(socket, Buffer.concat(parts.map(toBuffer)));
    switch (verb) {
      case 'APING':
        reply('APING', [0]);
        break;
      case 'AVERS':
        reply('SVERS', [0, 88, 3, 0, 0, 99, 2, 1]);
        break;
      case 'CURCH':
        reply('CHCUR', [10, 87]);
        break;
      case 'SFILE':
        reply(
          `FILES,${PLATFORM.name}_C${PLATFORM.config}.xml,${PLATFORM.name}_S${PLATFORM.log}.xml`,
        );
        break;
      case 'STATU': {
        const start = payload.readUInt16BE(6);
        const length = payload.readUInt16BE(8);
        const data = this.block.subarray(start, start + length);
        const chunk = 128;
        const count = Math.ceil(data.length / chunk);
        for (let index = 0; index < count; index += 1) {
          const part = data.subarray(index * chunk, (index + 1) * chunk);
          const next = index + 1 < count ? index + 1 : 0;
          reply('STATV', [index, next, part.length], part);
        }
        break;
      }
      case 'SPACK': {
        const length = payload.readUInt8(7) - 5;
        const pos = payload.readUInt16BE(11);
        payload.subarray(13, 13 + length).copy(this.block, pos);
        reply('PACKS');
        break;
      }
      case 'GETWC':
        reply('WCGET', [this.watercare]);
        break;
      case 'SETWC':
        this.watercare = payload.readUInt8(6);
        reply('WCSET', [this.watercare]);
        break;
      default:
        break;
    }
  }

  /** Push a change of the status block to the client (STATP). */
  push(name, apply) {
    const accessor = this.accessor(name);
    apply();
    const { pos } = accessor;
    const changes = Buffer.alloc(5);
    changes.writeUInt8(1, 0);
    changes.writeUInt16BE(pos, 1);
    this.block.copy(changes, 3, pos, pos + 2);
    this.reply(this.socket, Buffer.concat([Buffer.from('STATP'), changes]));
  }

  /** A HELLO answer, as the mediated scan relays it. */
  helloScanResult() {
    return {
      source_ip: this.host,
      source_port: 10022,
      payload_base64: Buffer.from(`<HELLO>${this.spaId}|${this.name}</HELLO>`).toString('base64'),
    };
  }
}

function toBuffer(part) {
  if (Buffer.isBuffer(part)) {
    return part;
  }
  return typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part);
}

/** Wait for the fake datagrams in flight to be handled. */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
