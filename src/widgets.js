// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): the spa at a glance.
//
//   - two LIVE tiles bound to the water and target temperature features;
//   - a status list computed here (heating, water care, connection);
//   - buttons: toggle the light, stop everything, and set the temperature
//     through a small form (the typed value arrives as `values`).
//
// The content is declarative: the core renders it with its theme, dark mode
// and the user's language (multi-language objects).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, createLogger } from '@gladysassistant/integration-sdk';
import { FEATURES, idsOf } from './devices/spa.js';
import { WATERCARE_LABELS, t } from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const SPA_OVERVIEW_WIDGET = 'spa_overview';

export const SPA_OVERVIEW_ACTIONS = {
  TOGGLE_LIGHT: 'toggle_light',
  STOP_ALL: 'stop_all',
  SET_TEMPERATURE: 'set_temperature',
};

function findEntry(manager, settings) {
  try {
    return manager.resolve(settings?.device || undefined);
  } catch {
    return null;
  }
}

export const WIDGETS = {
  [SPA_OVERVIEW_WIDGET]: {
    async get(manager, { settings }) {
      logger.debug(`onWidgetGet <- ${SPA_OVERVIEW_WIDGET}`);
      const entry = findEntry(manager, settings);
      const capabilities = entry && manager.store.spas[entry.spaId]?.capabilities;
      if (!entry || !capabilities) {
        return {
          ttl_seconds: 60,
          components: [{ type: 'text', variant: 'body', text: t('noSpaWidget') }],
        };
      }
      const ids = idsOf(manager.gladys, entry.spaId);
      const snapshot = entry.client.snapshot();
      const connected = entry.client.connected;
      const components = [];

      if (capabilities.heater) {
        components.push(
          {
            type: 'value',
            label: t('water'),
            icon: 'droplet',
            device_feature: ids.feature(FEATURES.WATER_TEMPERATURE),
          },
          {
            type: 'value',
            label: t('target'),
            icon: 'thermometer',
            device_feature: ids.feature(FEATURES.TARGET_TEMPERATURE),
          },
        );
      }

      const items = [];
      if (capabilities.heater) {
        items.push({
          label: t('heating'),
          icon: 'sun',
          value: snapshot?.heating ? t('heatingOn') : t('heatingOff'),
          color: snapshot?.heating ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
        });
      }
      if (snapshot?.watercareMode) {
        items.push({
          label: t('watercare'),
          icon: 'shield',
          value: WATERCARE_LABELS[snapshot.watercareMode] ?? t('unknown'),
          color: WIDGET_COLORS.INFO,
        });
      }
      items.push({
        label: t('connection'),
        icon: 'wifi',
        value: connected ? t('connected') : t('unreachable'),
        color: connected ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
      });
      components.push({ type: 'status', items });

      const params = { device: ids.device };
      if (connected && capabilities.equipment.some((item) => item.kind === 'light')) {
        components.push({
          type: 'button',
          label: t('toggleLight'),
          icon: 'sun',
          style: 'secondary',
          action: { key: SPA_OVERVIEW_ACTIONS.TOGGLE_LIGHT, params },
        });
      }
      if (connected && capabilities.canSetTemperature) {
        components.push({
          type: 'button',
          label: t('setTemperature'),
          icon: 'thermometer',
          style: 'primary',
          action: {
            key: SPA_OVERVIEW_ACTIONS.SET_TEMPERATURE,
            params,
            fields: [
              {
                key: 'temperature',
                type: 'number',
                label: t('temperatureField'),
                required: true,
                min: capabilities.minSetpoint,
                max: capabilities.maxSetpoint,
                ...(Number.isFinite(snapshot?.targetTemperature)
                  ? { default: snapshot.targetTemperature }
                  : {}),
              },
            ],
          },
        });
      }
      if (connected && capabilities.equipment.length > 0) {
        components.push({
          type: 'button',
          label: t('stopAll'),
          icon: 'power',
          style: 'danger',
          action: { key: SPA_OVERVIEW_ACTIONS.STOP_ALL, params, confirm: true },
        });
      }
      // The computed rows follow the spa pushes, which nudge the widget (see
      // index.js): the TTL is only a safety net.
      return { ttl_seconds: 300, components };
    },

    // `params` were declared in the content above, never typed by the user;
    // the only typed input is `values.temperature`, validated by the core.
    async action(manager, { actionKey, params, values }) {
      logger.info(`onWidgetAction <- ${SPA_OVERVIEW_WIDGET}.${actionKey}`);
      const entry = manager.resolve(params?.device);
      switch (actionKey) {
        case SPA_OVERVIEW_ACTIONS.TOGGLE_LIGHT: {
          const on = await manager.toggleLight(entry);
          if (on === null) {
            return t('identifyUnsupported');
          }
          return on ? t('lightOn') : t('lightOff');
        }
        case SPA_OVERVIEW_ACTIONS.STOP_ALL:
          await manager.stopAll(entry);
          return t('stopped');
        case SPA_OVERVIEW_ACTIONS.SET_TEMPERATURE: {
          const applied = await manager.setTargetTemperature(entry, Number(values?.temperature));
          return {
            en: `${applied} °C`,
            fr: `${applied} °C`,
            de: `${applied} °C`,
            es: `${applied} °C`,
          };
        }
        default:
          throw new Error(`Unknown widget action: ${actionKey}`);
      }
    },
  },
};

/** Ask the core to re-pull the widgets (rate-limited core-side). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
