// -----------------------------------------------------------------------------
// What a spa can do, and what it is doing, read from its memory map.
//
// The controller declares which equipment is wired to which relay output
// (Out1 = "P1H", Out2 = "P2L"...): the "connections". A pump, the blower or a
// light is offered only when it is connected AND its user-demand value (UdP1,
// UdBL, UdLi...) exists in the memory map. Same rules as geckolib.
// -----------------------------------------------------------------------------

import { readValue, encodeWrite } from './packs.js';

/** Equipment driven through a user-demand value. Keys are stored by users. */
export const EQUIPMENT = [
  { key: 'P1', kind: 'pump', demand: 'UdP1', name: 'Pump 1' },
  { key: 'P2', kind: 'pump', demand: 'UdP2', name: 'Pump 2' },
  { key: 'P3', kind: 'pump', demand: 'UdP3', name: 'Pump 3' },
  { key: 'P4', kind: 'pump', demand: 'UdP4', name: 'Pump 4' },
  { key: 'P5', kind: 'pump', demand: 'UdP5', name: 'Pump 5' },
  { key: 'BL', kind: 'blower', demand: 'UdBL', name: 'Blower' },
  { key: 'Waterfall', kind: 'waterfall', demand: 'UdWaterfall', name: 'Waterfall' },
  { key: 'LI', kind: 'light', demand: 'UdLi', name: 'Light' },
  { key: 'L120', kind: 'light', demand: 'UdL120', name: 'Light 2' },
];

/** Read-only equipment reported by the controller. */
export const INDICATORS = [
  { key: 'CP', name: 'Circulation pump' },
  { key: 'O3', name: 'Ozone' },
];

export const OFF = 'OFF';

// Default setpoint range of the Gecko controllers, when the map has none.
const DEFAULT_MIN_SETPOINT = 15;
const DEFAULT_MAX_SETPOINT = 40;

/**
 * The equipment wired to the controller outputs, e.g. ['P1H', 'P1L', 'BLO', 'LI'].
 */
export function connectionsOf(pack, block) {
  return pack.outputs
    .map((name) => readValue(block, pack.accessors[name]))
    .filter(
      (value) => typeof value === 'string' && value !== '' && value !== 'NA' && value !== 'Not_Set',
    );
}

function isConnected(connections, key) {
  if (key === 'BL') {
    return connections.includes('BL') || connections.includes('BLO');
  }
  return (
    connections.includes(key) ||
    connections.includes(key.toUpperCase()) ||
    connections.includes(`${key}H`) ||
    connections.includes(`${key}L`) ||
    connections.includes(`${key}O`)
  );
}

/**
 * The capabilities of a spa: its controllable equipment, its indicators and
 * whether it exposes its heater.
 */
export function capabilitiesOf(pack, block) {
  const connections = connectionsOf(pack, block);
  const equipment = [];
  for (const item of EQUIPMENT) {
    let demand = pack.accessors[item.demand];
    // A variable speed pump 1/3 is driven through its own percentage value.
    const vsp = item.key === 'P1' ? 'Pump1AsVSP' : item.key === 'P3' ? 'Pump3AsVSP' : null;
    let variableSpeed = false;
    if (vsp && pack.accessors[vsp] && readValue(block, pack.accessors[vsp]) === true) {
      const vspDemand = pack.accessors[`UdVSP${item.key.slice(1)}`];
      if (vspDemand) {
        demand = vspDemand;
        variableSpeed = true;
      }
    }
    if (!demand || !demand.writable || !isConnected(connections, item.key)) {
      continue;
    }
    equipment.push({
      key: item.key,
      kind: item.kind,
      name: item.name,
      demand: demand.name,
      variableSpeed,
      modes: variableSpeed ? null : (demand.items ?? null),
    });
  }
  const indicators = INDICATORS.filter(
    (item) => pack.accessors[item.key] && isConnected(connections, item.key),
  ).map((item) => ({ key: item.key, name: item.name }));
  const setpoint = pack.accessors.SetpointG;
  return {
    equipment,
    indicators,
    heater: Boolean(setpoint),
    canSetTemperature: Boolean(setpoint?.writable),
    minSetpoint: pickSetpointBound(pack, block, 'MinSetpointG', DEFAULT_MIN_SETPOINT),
    maxSetpoint: pickSetpointBound(pack, block, 'MaxSetpointG', DEFAULT_MAX_SETPOINT),
  };
}

function pickSetpointBound(pack, block, name, fallback) {
  const accessor = pack.accessors[name];
  if (!accessor) {
    return fallback;
  }
  const value = readValue(block, accessor);
  // An uninitialized bound reads 0 °C: keep the documented range then.
  return Number.isFinite(value) && value >= 5 && value <= 45 ? value : fallback;
}

/**
 * A snapshot of the spa state.
 * @returns {{
 *   waterTemperature: number | null,
 *   targetTemperature: number | null,
 *   heating: boolean,
 *   equipment: Record<string, string | number>,
 *   indicators: Record<string, boolean>,
 * }}
 */
export function snapshotOf(pack, block, capabilities) {
  const value = (name) => (pack.accessors[name] ? readValue(block, pack.accessors[name]) : null);
  const temperatureValid = value('TempNotValid') !== true;
  const water = value('DisplayedTempG') ?? value('RhWaterTemp');
  const heating = value('Heating');
  const equipment = {};
  for (const item of capabilities.equipment) {
    equipment[item.key] = value(item.demand);
  }
  const indicators = {};
  for (const item of capabilities.indicators) {
    const state = value(item.key);
    indicators[item.key] = state === true || (typeof state === 'string' && state !== OFF);
  }
  return {
    waterTemperature: temperatureValid && Number.isFinite(water) ? water : null,
    targetTemperature: value('SetpointG'),
    heating:
      typeof heating === 'string' ? heating !== '' && heating !== 'Unknown' : heating === true,
    equipment,
    indicators,
  };
}

/** Is a piece of equipment running, from its demand value? */
export function isRunning(state) {
  if (typeof state === 'number') {
    return state > 0;
  }
  return typeof state === 'string' && state !== OFF && state !== 'Unknown';
}

/** The demand value that turns a piece of equipment on, at its highest speed. */
export function onModeOf(item) {
  if (item.variableSpeed) {
    return 100;
  }
  const modes = item.modes ?? [];
  for (const candidate of ['HI', 'ON', 'HIGH']) {
    if (modes.includes(candidate)) {
      return candidate;
    }
  }
  return modes.at(-1) ?? 1;
}

/** The demand value of a speed among OFF / LO / HI, adapted to the equipment. */
export function modeForSpeed(item, speed) {
  if (speed === 'OFF') {
    return item.variableSpeed ? 0 : OFF;
  }
  if (item.variableSpeed) {
    return speed === 'LO' ? 50 : 100;
  }
  const modes = item.modes ?? [];
  if (speed === 'LO' && modes.includes('LO')) {
    return 'LO';
  }
  return onModeOf(item);
}

/** Bytes to write to set the demand of an equipment. */
export function encodeDemand(pack, block, item, mode) {
  return encodeWrite(block, pack.accessors[item.demand], mode);
}

/** Bytes to write to set the target temperature, clamped to the spa range. */
export function encodeSetpoint(pack, block, capabilities, celsius) {
  const clamped = clampSetpoint(capabilities, celsius);
  return { ...encodeWrite(block, pack.accessors.SetpointG, clamped), value: clamped };
}

export function clampSetpoint(capabilities, celsius) {
  const value = Math.round(Number(celsius) * 2) / 2;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid temperature: ${celsius}`);
  }
  return Math.min(capabilities.maxSetpoint, Math.max(capabilities.minSetpoint, value));
}
