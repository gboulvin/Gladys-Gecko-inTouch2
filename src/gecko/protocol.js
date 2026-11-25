// -----------------------------------------------------------------------------
// Gecko in.touch2 local protocol: framing, requests and response parsers.
//
// The in.touch2 Wi-Fi module (the "EN" module, next to the router) talks UDP on
// port 10022. Two kinds of datagrams travel:
//
//   <HELLO>...</HELLO>      discovery: a client sends `<HELLO>1</HELLO>`, every
//                           module answers `<HELLO>{spa id}|{spa name}</HELLO>`;
//   <PACKT>                 everything else, addressed by identifiers:
//     <SRCCN>{sender id}</SRCCN><DESCN>{recipient id}</DESCN>
//     <DATAS>{binary payload}</DATAS>
//   </PACKT>
//
// A payload starts with a 5-letter verb (APING, AVERS, STATU...), followed by
// big-endian binary fields. This module only builds and parses bytes: no
// socket, no timer, so it is fully unit-tested.
//
// Protocol knowledge from the reverse engineering work of the geckolib project
// (https://github.com/gazoodle/geckolib, GPL-3.0).
// -----------------------------------------------------------------------------

export const INTOUCH2_PORT = 10022;

// Text parts of the protocol are latin1.
const ENCODING = 'latin1';

const HELLO_OPEN = Buffer.from('<HELLO>', ENCODING);
const HELLO_CLOSE = Buffer.from('</HELLO>', ENCODING);
const PACKET_OPEN = Buffer.from('<PACKT>', ENCODING);
const PACKET_CLOSE = Buffer.from('</PACKT>', ENCODING);

export const VERBS = {
  PING: 'APING',
  VERSION_REQUEST: 'AVERS',
  VERSION_RESPONSE: 'SVERS',
  CHANNEL_REQUEST: 'CURCH',
  CHANNEL_RESPONSE: 'CHCUR',
  FILE_REQUEST: 'SFILE',
  FILE_RESPONSE: 'FILES',
  STATUS_REQUEST: 'STATU',
  STATUS_RESPONSE: 'STATV',
  STATUS_PUSH: 'STATP',
  STATUS_PUSH_ACK: 'STATQ',
  PACK_COMMAND: 'SPACK',
  PACK_COMMAND_RESPONSE: 'PACKS',
  WATERCARE_GET: 'GETWC',
  WATERCARE_GET_RESPONSE: 'WCGET',
  WATERCARE_SET: 'SETWC',
  WATERCARE_SET_RESPONSE: 'WCSET',
  WATERCARE_ERROR: 'WCERR',
  RF_ERROR: 'RFERR',
};

const PACK_COMMAND_KEY_PRESS = 57;
const PACK_COMMAND_SET_VALUE = 70;

/** Watercare modes, by protocol index. Keys are stored by users: never rename. */
export const WATERCARE_MODES = [
  'away',
  'standard',
  'energy_saving',
  'super_energy_saving',
  'weekender',
];

/** The status block the spa exposes is at most 1 KiB. */
export const STATUS_BLOCK_SIZE = 1024;

// --- HELLO ---------------------------------------------------------------------

/** The discovery broadcast every in.touch2 module answers. */
export function buildHelloBroadcast() {
  return Buffer.concat([HELLO_OPEN, Buffer.from('1', ENCODING), HELLO_CLOSE]);
}

/**
 * Parse a HELLO answer of a spa: `<HELLO>SPA00:11:22:33:44:55|My spa</HELLO>`.
 * Resolves null for anything else (another client's broadcast or HELLO).
 * @param {Buffer} datagram
 * @returns {{ spaId: string, name: string } | null}
 */
export function parseHello(datagram) {
  if (!isWrapped(datagram, HELLO_OPEN, HELLO_CLOSE)) {
    return null;
  }
  const content = datagram.subarray(HELLO_OPEN.length, datagram.length - HELLO_CLOSE.length);
  const text = content.toString(ENCODING);
  // `1` is a discovery broadcast, IOS/AND prefixes are other clients.
  if (text === '1' || text.startsWith('IOS') || text.startsWith('AND') || text.length === 0) {
    return null;
  }
  const separator = text.indexOf('|');
  if (separator === -1) {
    return { spaId: text, name: 'Spa' };
  }
  const spaId = text.slice(0, separator);
  const name = text.slice(separator + 1).trim();
  return spaId ? { spaId, name: name || 'Spa' } : null;
}

// --- PACKT ---------------------------------------------------------------------

/**
 * Wrap a payload in a PACKT envelope.
 * @param {string} source - Identifier of the sender (our client id).
 * @param {string} destination - Identifier of the recipient (the spa id).
 * @param {Buffer} payload - Verb + binary fields.
 */
export function buildPacket(source, destination, payload) {
  return Buffer.concat([
    PACKET_OPEN,
    Buffer.from(`<SRCCN>${source}</SRCCN><DESCN>${destination}</DESCN><DATAS>`, ENCODING),
    payload,
    Buffer.from('</DATAS>', ENCODING),
    PACKET_CLOSE,
  ]);
}

/**
 * Unwrap a PACKT envelope. Resolves null for anything that is not one.
 * @param {Buffer} datagram
 * @returns {{ source: string, destination: string, payload: Buffer } | null}
 */
export function parsePacket(datagram) {
  if (!isWrapped(datagram, PACKET_OPEN, PACKET_CLOSE)) {
    return null;
  }
  const body = datagram.subarray(PACKET_OPEN.length, datagram.length - PACKET_CLOSE.length);
  const source = between(body, '<SRCCN>', '</SRCCN>');
  const destination = between(body, '<DESCN>', '</DESCN>');
  const dataStart = body.indexOf('<DATAS>', 0, ENCODING);
  const dataEnd = body.lastIndexOf('</DATAS>', body.length, ENCODING);
  if (source === null || destination === null || dataStart === -1 || dataEnd < dataStart) {
    return null;
  }
  return {
    source: source.toString(ENCODING),
    destination: destination.toString(ENCODING),
    payload: body.subarray(dataStart + '<DATAS>'.length, dataEnd),
  };
}

/** The 5-letter verb of a payload. */
export function verbOf(payload) {
  return payload.subarray(0, 5).toString(ENCODING);
}

// --- Requests --------------------------------------------------------------------

const verb = (name) => Buffer.from(name, ENCODING);
const bytes = (...values) => Buffer.from(values);

export const requests = {
  ping: () => verb(VERBS.PING),
  version: (seq) => Buffer.concat([verb(VERBS.VERSION_REQUEST), bytes(seq)]),
  channel: (seq) => Buffer.concat([verb(VERBS.CHANNEL_REQUEST), bytes(seq)]),
  configFile: (seq) => Buffer.concat([verb(VERBS.FILE_REQUEST), bytes(seq)]),
  statusBlock(seq, start, length) {
    const fields = Buffer.alloc(5);
    fields.writeUInt8(seq, 0);
    fields.writeUInt16BE(start, 1);
    fields.writeUInt16BE(length, 3);
    return Buffer.concat([verb(VERBS.STATUS_REQUEST), fields]);
  },
  statusPushAck: (seq) => Buffer.concat([verb(VERBS.STATUS_PUSH_ACK), bytes(seq)]),
  /**
   * Write `data` (1 or 2 bytes) at `pos` of the status block.
   */
  setValue({ seq, packType, configVersion, logVersion, pos, data }) {
    const fields = Buffer.alloc(8);
    fields.writeUInt8(seq, 0);
    fields.writeUInt8(packType, 1);
    fields.writeUInt8(5 + data.length, 2);
    fields.writeUInt8(PACK_COMMAND_SET_VALUE, 3);
    fields.writeUInt8(configVersion, 4);
    fields.writeUInt8(logVersion, 5);
    fields.writeUInt16BE(pos, 6);
    return Buffer.concat([verb(VERBS.PACK_COMMAND), fields, data]);
  },
  keyPress: ({ seq, packType, key }) =>
    Buffer.concat([verb(VERBS.PACK_COMMAND), bytes(seq, packType, 2, PACK_COMMAND_KEY_PRESS, key)]),
  getWatercare: (seq) => Buffer.concat([verb(VERBS.WATERCARE_GET), bytes(seq)]),
  setWatercare: (seq, mode) => Buffer.concat([verb(VERBS.WATERCARE_SET), bytes(seq, mode)]),
};

// --- Responses -------------------------------------------------------------------

/** SVERS: firmware versions of the EN (home) and CO (spa side) modules. */
export function parseVersion(payload) {
  const data = payload.subarray(5);
  if (data.length < 8) {
    return null;
  }
  return {
    en: `${data.readUInt16BE(0)} v${data.readUInt8(2)}.${data.readUInt8(3)}`,
    co: `${data.readUInt16BE(4)} v${data.readUInt8(6)}.${data.readUInt8(7)}`,
  };
}

/** CHCUR: radio channel and signal strength between the EN and CO modules. */
export function parseChannel(payload) {
  const data = payload.subarray(5);
  if (data.length < 2) {
    return null;
  }
  return { channel: data.readUInt8(0), signal: data.readUInt8(1) };
}

/**
 * FILES: the controller platform and the versions of its memory maps, e.g.
 * `FILES,inYT_C87.xml,inYT_S83.xml`.
 */
export function parseConfigFile(payload) {
  const text = payload.subarray(5).toString(ENCODING).replace(/\.xml/g, '');
  const [config, log] = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const configMatch = /^(.+)_C(\d+)$/.exec(config ?? '');
  const logMatch = /^(.+)_S(\d+)$/.exec(log ?? '');
  if (!configMatch || !logMatch || configMatch[1] !== logMatch[1]) {
    return null;
  }
  return {
    platform: configMatch[1].toLowerCase(),
    configVersion: Number(configMatch[2]),
    logVersion: Number(logMatch[2]),
  };
}

/** STATV: one segment of a status block read. */
export function parseStatusSegment(payload) {
  const data = payload.subarray(5);
  if (data.length < 3) {
    return null;
  }
  const length = data.readUInt8(2);
  return {
    index: data.readUInt8(0),
    next: data.readUInt8(1),
    data: data.subarray(3, 3 + length),
  };
}

/** STATP: values the spa pushes when they change, 2 bytes each. */
export function parseStatusPush(payload) {
  const data = payload.subarray(5);
  if (data.length < 1) {
    return [];
  }
  const count = data.readUInt8(0);
  const changes = [];
  for (let i = 0; i < count; i += 1) {
    const offset = 1 + i * 4;
    if (offset + 4 > data.length) {
      break;
    }
    changes.push({ pos: data.readUInt16BE(offset), data: data.subarray(offset + 2, offset + 4) });
  }
  return changes;
}

/** WCGET / WCSET: the active watercare mode. */
export function parseWatercare(payload) {
  const data = payload.subarray(5);
  if (data.length < 1) {
    return null;
  }
  return data.readUInt8(0) % WATERCARE_MODES.length;
}

// --- Helpers -------------------------------------------------------------------

function isWrapped(datagram, open, close) {
  return (
    Buffer.isBuffer(datagram) &&
    datagram.length >= open.length + close.length &&
    datagram.subarray(0, open.length).equals(open) &&
    datagram.subarray(datagram.length - close.length).equals(close)
  );
}

function between(buffer, open, close) {
  const start = buffer.indexOf(open, 0, ENCODING);
  if (start === -1) {
    return null;
  }
  const end = buffer.indexOf(close, start + open.length, ENCODING);
  return end === -1 ? null : buffer.subarray(start + open.length, end);
}
