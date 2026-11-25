// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Each handler receives the RESOLVED fields (a `"source": "devices"` field is
// the chosen spa device external_id) and resolves the declared scalar
// `outputs`. Throwing fails this action only: the scene logs it and continues.
// No scene event is ever fired as a consequence of an action (loops).
//
// Scene TRIGGERS are fired by the spa manager on transitions, see
// src/spaManager.js (TRIGGERS).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  async set_target_temperature(manager, { fields }) {
    logger.info(`Scene action set_target_temperature <- ${fields.temperature}`);
    const entry = manager.resolve(fields.device);
    const applied = await manager.setTargetTemperature(entry, Number(fields.temperature));
    return { target_temperature: applied };
  },

  async set_watercare_mode(manager, { fields }) {
    logger.info(`Scene action set_watercare_mode <- ${fields.mode}`);
    const entry = manager.resolve(fields.device);
    const mode = await manager.setWatercareMode(entry, fields.mode);
    return { mode };
  },

  // A spa without the chosen equipment is an output, not a failure: a scene
  // action is never a condition, the scene author gates on `applied`.
  async set_equipment(manager, { fields }) {
    logger.info(`Scene action set_equipment <- ${fields.equipment} = ${fields.speed}`);
    const entry = manager.resolve(fields.device);
    const applied = await manager.setEquipment(entry, fields.equipment, fields.speed ?? 'HI');
    return { applied };
  },

  async stop_all(manager, { fields }) {
    logger.info('Scene action stop_all');
    const entry = manager.resolve(fields.device);
    const stopped = await manager.stopAll(entry);
    return { stopped };
  },
};
