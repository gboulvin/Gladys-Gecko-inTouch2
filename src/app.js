// -----------------------------------------------------------------------------
// SDK wiring: every handler, registered on the Gladys client BEFORE connect().
// Kept out of index.js so the tests run it against the SDK's fake Gladys.
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { SpaManager } from './spaManager.js';
import { ACTIONS } from './actions.js';
import { SCENE_ACTIONS } from './scenes.js';
import { WIDGETS, refreshWidgets } from './widgets.js';
import { t } from './i18n.js';

// Spa pushes can arrive every few seconds (the water temperature moves by
// tenths): nudge the dashboard widgets at most every 15 s.
const WIDGET_REFRESH_INTERVAL_MS = 15_000;

/**
 * @param {object} options
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
 * @param {import('./store.js').Store} options.store
 * @param {(gladys: object, store: object, onChange: () => void) => SpaManager} [options.createManager]
 * @returns {SpaManager}
 */
export function registerHandlers({ gladys, store, createManager }) {
  let lastWidgetRefresh = 0;
  const nudgeWidgets = () => {
    const now = Date.now();
    if (now - lastWidgetRefresh >= WIDGET_REFRESH_INTERVAL_MS) {
      lastWidgetRefresh = now;
      refreshWidgets(gladys);
    }
  };
  const manager = createManager
    ? createManager(gladys, store, nudgeWidgets)
    : new SpaManager({ gladys, store, onChange: nudgeWidgets });
  let started = false;

  // --- Discovery: the user opened the Discovery tab -------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> looking for in.touch2 modules');
    await manager.scan();
    await manager.publishDevices();
    await manager.publishTransports();
    await manager.reportConnectionStatus();
  });

  // --- Commands on device features -------------------------------------------
  gladys.onSetValue(async (device, feature, value) => {
    logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
    await manager.setFeature(device, feature, value);
  });

  // --- Configuration screen buttons --------------------------------------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(manager, fields ?? {}));
  }

  // --- Scene actions -------------------------------------------------------------
  // Scene TRIGGERS need no handler: the manager fires them on transitions.
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(manager, { fields }));
  }

  // --- Dashboard widgets -----------------------------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(manager, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings, values } = {}) =>
      widget.action(manager, { actionKey, params, settings, values }),
    );
  }

  // --- Configuration updated -------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    const config = normalizeConfig(newConfig);
    manager.setConfig(config);
    if (config.spa_host) {
      await manager.scan();
      await manager.publishDevices();
    }
    await manager.reportConnectionStatus();
    refreshWidgets(gladys);
  });

  // --- Connection lifecycle (the SDK logs the WebSocket itself) --------------------
  gladys.on('connected', async () => {
    try {
      manager.setConfig(normalizeConfig(await gladys.getConfig()));
      if (!started) {
        started = true;
        await store.load();
        await manager.start();
      }
      await manager.publishDevices();
      await manager.publishTransports();
      // States published while Gladys was away may be lost: re-send them all.
      gladys.forgetPublishedStates();
      for (const entry of manager.spas.values()) {
        await manager.publishStates(entry);
      }
      await manager.reportConnectionStatus();
      refreshWidgets(gladys);
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, t('initFailed')).catch(() => {});
    }
  });

  return manager;
}
