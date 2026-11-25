// -----------------------------------------------------------------------------
// Memory maps of the spa controllers, and the accessors that read and write
// them.
//
// The spa exposes its whole state as a "status block" of up to 1 KiB. Where a
// value lives (water temperature, pump 1 demand...) depends on the controller
// platform (inYT, inXE, inYJ...) and on the config/log versions it reports in
// its FILES answer. packs.json holds those maps, extracted from the geckolib
// pack definitions by tools/extract-packs.py.
//
// An accessor is encoded as [pos, kind, bitpos, items, size, maxitems, rw]:
//   - kind: Byte | Word | Time | Temp | Bool | Enum;
//   - bitpos/maxitems: a value packed in some bits of a byte;
//   - items: the labels of an Enum, by raw value;
//   - rw: null when the value is read-only.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const PACKS = JSON.parse(readFileSync(new URL('./packs.json', import.meta.url), 'utf8'));

export class UnsupportedSpaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedSpaError';
  }
}

/** Platforms the integration knows, e.g. ['inxe', 'inyt', ...]. */
export const SUPPORTED_PLATFORMS = Object.keys(PACKS);

/**
 * Resolve the memory map of a spa.
 * @param {string} platform - Lower-case platform key from the FILES answer.
 * @param {number} configVersion
 * @param {number} logVersion
 * @returns {{ platform: string, packType: number, accessors: Record<string, Accessor>, outputs: string[] }}
 */
export function loadPack(platform, configVersion, logVersion) {
  const pack = PACKS[platform];
  if (!pack) {
    throw new UnsupportedSpaError(`Unsupported spa controller platform "${platform}"`);
  }
  const config = pack.cfg[String(configVersion)];
  const log = pack.log[String(logVersion)];
  if (!config || !log) {
    throw new UnsupportedSpaError(
      `Unsupported ${platform} memory map versions (config ${configVersion}, log ${logVersion})`,
    );
  }
  const accessors = {};
  for (const [name, encoded] of Object.entries({ ...config.accessors, ...log.accessors })) {
    accessors[name] = decodeAccessor(name, encoded);
  }
  return {
    platform,
    packType: pack.type,
    accessors,
    outputs: [...config.outputs, ...log.outputs].filter((name) => accessors[name]),
  };
}

/**
 * @typedef {object} Accessor
 * @property {string} name
 * @property {number} pos
 * @property {string} kind
 * @property {number | null} bitpos
 * @property {string[] | null} items
 * @property {number} length - 1 or 2 bytes.
 * @property {number} bitmask
 * @property {boolean} writable
 */
function decodeAccessor(name, [pos, kind, bitpos, items, size, maxitems, rw]) {
  let length = 1;
  if (kind === 'Word' || kind === 'Time' || kind === 'Temp' || size === 2) {
    length = 2;
  }
  let bitmask = 1;
  if (maxitems !== null && maxitems !== undefined) {
    bitmask = (1 << Math.ceil(Math.log2(Math.max(maxitems, 2)))) - 1;
  }
  return {
    name,
    pos,
    kind,
    bitpos: bitpos ?? null,
    items: items ?? null,
    length,
    bitmask,
    writable: rw !== null && rw !== undefined,
  };
}

/** The raw integer of an accessor in a status block. */
export function readRaw(block, accessor) {
  if (accessor.pos + accessor.length > block.length) {
    return 0;
  }
  let raw =
    accessor.length === 2 ? block.readUInt16BE(accessor.pos) : block.readUInt8(accessor.pos);
  if (accessor.bitpos !== null) {
    raw = (raw >> accessor.bitpos) & accessor.bitmask;
  }
  return raw;
}

/**
 * The decoded value of an accessor: a boolean, an enum label, a number, or a
 * temperature in °C.
 */
export function readValue(block, accessor) {
  const raw = readRaw(block, accessor);
  switch (accessor.kind) {
    case 'Bool':
      return raw === 1;
    case 'Enum':
      return accessor.items?.[raw] ?? 'Unknown';
    case 'Temp':
      return rawToCelsius(raw);
    case 'Time':
      return `${String(Math.floor(raw / 256)).padStart(2, '0')}:${String(raw % 256).padStart(2, '0')}`;
    default:
      return raw;
  }
}

/**
 * Encode a new value of an accessor into the bytes the spa expects at
 * `accessor.pos`. Bits shared with other values are taken from `block`.
 * @returns {{ pos: number, data: Buffer }}
 */
export function encodeWrite(block, accessor, value) {
  if (!accessor.writable) {
    throw new Error(`${accessor.name} is read-only`);
  }
  let raw;
  switch (accessor.kind) {
    case 'Enum': {
      raw = accessor.items?.indexOf(String(value)) ?? -1;
      if (raw === -1) {
        throw new Error(`${accessor.name} cannot be set to "${value}"`);
      }
      break;
    }
    case 'Bool':
      raw = value === true || value === 1 || value === 'true' ? 1 : 0;
      break;
    case 'Temp':
      raw = celsiusToRaw(Number(value));
      break;
    default:
      raw = Math.round(Number(value));
  }
  if (accessor.bitpos !== null) {
    const existing =
      accessor.length === 2 ? block.readUInt16BE(accessor.pos) : block.readUInt8(accessor.pos);
    raw =
      (existing & ~(accessor.bitmask << accessor.bitpos)) |
      ((raw & accessor.bitmask) << accessor.bitpos);
  }
  const data = Buffer.alloc(accessor.length);
  if (accessor.length === 2) {
    data.writeUInt16BE(raw & 0xffff, 0);
  } else {
    data.writeUInt8(raw & 0xff, 0);
  }
  return { pos: accessor.pos, data };
}

// The controller stores temperatures in tenths of °F above freezing, whatever
// the unit shown on the keypad: raw / 18 is always the temperature in °C.
export function rawToCelsius(raw) {
  return Math.round((raw / 18) * 10) / 10;
}

export function celsiusToRaw(celsius) {
  return Math.round(celsius * 18);
}
