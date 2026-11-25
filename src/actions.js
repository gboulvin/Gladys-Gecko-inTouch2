// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`). Each handler
// resolves the multi-language message shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { perLanguage, t } from './i18n.js';

const logger = createLogger({ name: 'actions' });

const FOUND = {
  en: (n, names) => `${n} spa(s) found: ${names}. Add them from the Discovery tab.`,
  fr: (n, names) => `${n} spa(s) trouvé(s) : ${names}. Ajoutez-les depuis l'onglet Découverte.`,
  de: (n, names) => `${n} Spa(s) gefunden: ${names}. Fügen Sie sie im Tab „Erkennung“ hinzu.`,
  es: (n, names) =>
    `${n} spa(s) encontrado(s): ${names}. Añádalos desde la pestaña Descubrimiento.`,
};

const STATUS = {
  en: { ok: 'connected', ko: 'not answering' },
  fr: { ok: 'connecté', ko: 'ne répond pas' },
  de: { ok: 'verbunden', ko: 'antwortet nicht' },
  es: { ok: 'conectado', ko: 'no responde' },
};

export const ACTIONS = {
  async scan(manager) {
    const spas = await manager.scan();
    await manager.publishDevices();
    await manager.publishTransports();
    await manager.reportConnectionStatus();
    if (spas.length === 0) {
      return t('scanNone');
    }
    const names = spas.map((spa) => `${spa.name} (${spa.host})`).join(', ');
    return perLanguage((language) => FOUND[language](spas.length, names));
  },

  async test_connection(manager) {
    const entries = [...manager.spas.values()];
    if (entries.length === 0) {
      return t('testNoSpa');
    }
    const lines = await Promise.all(
      entries.map(async (entry) => {
        if (!entry.client.connected) {
          await manager.connect(entry);
        }
        return { entry, ok: entry.client.connected };
      }),
    );
    await manager.publishTransports();
    await manager.reportConnectionStatus();
    return perLanguage((language) =>
      lines
        .map(({ entry, ok }) => {
          const signal = entry.client.channel?.signal;
          const detail = ok && Number.isFinite(signal) ? ` (${signal} %)` : '';
          return `${entry.name}: ${ok ? STATUS[language].ok : STATUS[language].ko}${detail}`;
        })
        .join(' · '),
    );
  },

  // `fields.device` comes from a `"source": "devices"` select: the
  // Configuration screen lists the integration's own created devices.
  async identify(manager, fields) {
    logger.info(`Action identify <- ${fields.device}`);
    const entry = manager.resolve(fields.device);
    return (await manager.identify(entry)) ? t('identifyDone') : t('identifyUnsupported');
  },
};
