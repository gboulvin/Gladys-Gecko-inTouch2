// -----------------------------------------------------------------------------
// The Gladys device of a spa: its features (from the capabilities read on the
// controller) and their states (from a snapshot of the status block).
//
// Feature keys are stored by Gladys (history, scenes, dashboards): never
// rename one. Equipment keys derive from the controller keys (p1, bl, li...).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { WATERCARE_MODES } from '../gecko/protocol.js';
import { isRunning } from '../gecko/model.js';
import { WATERCARE_LABELS } from '../i18n.js';

export const DEVICE_TYPE = 'spa';

export const FEATURES = {
  WATER_TEMPERATURE: 'water-temperature',
  TARGET_TEMPERATURE: 'target-temperature',
  HEATING: 'heating',
  WATERCARE: 'watercare',
  SIGNAL: 'signal',
};

/** The id of a spa in its external ids: `SPA00:11:...` -> `spa00-11-...`. */
export function platformIdOf(spaId) {
  return spaId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function idsOf(gladys, spaId) {
  return gladys.externalIds(DEVICE_TYPE, platformIdOf(spaId));
}

export function equipmentFeatureKey(item) {
  return item.key.toLowerCase();
}

/**
 * The discovery payload of a spa.
 * @param {object} spa - { spaId, name, host, capabilities }
 */
export function buildSpaDevice(gladys, { spaId, name, host, capabilities }) {
  const ids = idsOf(gladys, spaId);
  const features = [];
  const base = { read_only: true, has_feedback: false, keep_history: true };

  if (capabilities.heater) {
    features.push({
      ...base,
      name: 'Water temperature',
      external_id: ids.feature(FEATURES.WATER_TEMPERATURE),
      category: CATEGORIES.TEMPERATURE_SENSOR,
      // The water of the spa, not the air of a room: kept out of room averages.
      type: TYPES.TEMPERATURE_SENSOR.PROBE,
      unit: UNITS.CELSIUS,
      min: 0,
      max: 50,
    });
    features.push({
      name: 'Target temperature',
      external_id: ids.feature(FEATURES.TARGET_TEMPERATURE),
      category: CATEGORIES.THERMOSTAT,
      type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
      unit: UNITS.CELSIUS,
      min: capabilities.minSetpoint,
      max: capabilities.maxSetpoint,
      read_only: !capabilities.canSetTemperature,
      has_feedback: true,
      keep_history: true,
    });
    features.push({
      ...base,
      name: 'Heating',
      external_id: ids.feature(FEATURES.HEATING),
      category: CATEGORIES.WATER_HEATER,
      type: TYPES.WATER_HEATER.HEATING,
      min: 0,
      max: 1,
    });
  }

  for (const item of capabilities.equipment) {
    const isLight = item.kind === 'light';
    features.push({
      name: item.name,
      external_id: ids.feature(equipmentFeatureKey(item)),
      category: isLight ? CATEGORIES.LIGHT : CATEGORIES.SWITCH,
      type: isLight ? TYPES.LIGHT.BINARY : TYPES.SWITCH.BINARY,
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
      keep_history: true,
    });
  }

  for (const item of capabilities.indicators) {
    features.push({
      ...base,
      name: item.name,
      external_id: ids.feature(item.key.toLowerCase()),
      category: CATEGORIES.SWITCH,
      type: TYPES.SWITCH.BINARY,
      min: 0,
      max: 1,
    });
  }

  if (capabilities.watercare !== false) {
    features.push({
      name: 'Water care mode',
      external_id: ids.feature(FEATURES.WATERCARE),
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.SELECT,
      min: 0,
      max: 0,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      supported_options: WATERCARE_MODES.map((mode, index) => ({
        value: mode,
        label: WATERCARE_LABELS[mode].en,
        sort_order: index,
      })),
    });
  }

  features.push({
    ...base,
    name: 'Radio signal',
    external_id: ids.feature(FEATURES.SIGNAL),
    category: CATEGORIES.SIGNAL,
    type: TYPES.SIGNAL.QUALITY,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
    keep_history: false,
  });

  return {
    name: name || 'Spa',
    external_id: ids.device,
    model: 'Gecko in.touch2',
    params: [
      { name: 'IP_ADDRESS', value: host },
      { name: 'SPA_ID', value: spaId },
    ],
    features,
  };
}

/**
 * The states of a spa, ready for publishChangedStates.
 */
export function buildSpaStates(gladys, spaId, capabilities, snapshot) {
  const ids = idsOf(gladys, spaId);
  const states = [];
  const push = (key, state) => {
    if (state !== null && state !== undefined && Number.isFinite(state)) {
      states.push({ device_feature_external_id: ids.feature(key), state });
    }
  };
  if (capabilities.heater) {
    push(FEATURES.WATER_TEMPERATURE, snapshot.waterTemperature);
    push(FEATURES.TARGET_TEMPERATURE, snapshot.targetTemperature);
    push(FEATURES.HEATING, snapshot.heating ? 1 : 0);
  }
  for (const item of capabilities.equipment) {
    push(equipmentFeatureKey(item), isRunning(snapshot.equipment[item.key]) ? 1 : 0);
  }
  for (const item of capabilities.indicators) {
    push(item.key.toLowerCase(), snapshot.indicators[item.key] ? 1 : 0);
  }
  if (capabilities.watercare !== false && snapshot.watercareMode) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.WATERCARE),
      text: snapshot.watercareMode,
    });
  }
  // The module reports the link quality on one byte: keep it in 0-100.
  if (Number.isFinite(snapshot.signal)) {
    push(FEATURES.SIGNAL, Math.min(100, Math.max(0, snapshot.signal)));
  }
  return states;
}
