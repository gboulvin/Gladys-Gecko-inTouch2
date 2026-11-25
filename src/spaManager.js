// -----------------------------------------------------------------------------
// The spas of the integration: discovery, one UDP client per spa, states
// published to Gladys, scene triggers fired on transitions, and the commands
// every surface (device features, scene actions, widgets, manifest actions)
// goes through.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { GeckoSpaClient } from './gecko/client.js';
import { discoverThroughGladys, probeHost } from './gecko/discovery.js';
import {
  clampSetpoint,
  encodeDemand,
  encodeSetpoint,
  isRunning,
  modeForSpeed,
  onModeOf,
} from './gecko/model.js';
import { WATERCARE_MODES } from './gecko/protocol.js';
import {
  FEATURES,
  buildSpaDevice,
  buildSpaStates,
  equipmentFeatureKey,
  idsOf,
} from './devices/spa.js';
import { t } from './i18n.js';

const logger = createLogger({ name: 'spas' });

/** Scene trigger keys, as declared in the manifest `scene_triggers`. */
export const TRIGGERS = {
  TEMPERATURE_REACHED: 'water_temperature_reached',
  HEATING_CHANGED: 'heating_changed',
  CONNECTION_CHANGED: 'spa_connection_changed',
};

// The water is "at temperature" within this margin of the setpoint (°C).
const TEMPERATURE_REACHED_MARGIN = 0.25;
const PUBLISH_DEBOUNCE_MS = 500;
const RECONNECT_DELAY_MS = 60 * 1000;
const RF_DEGRADED_THRESHOLD = 5;

export class SpaManager {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {import('./store.js').Store} options.store
   * @param {(options: object) => GeckoSpaClient} [options.createClient]
   * @param {typeof probeHost} [options.probe]
   * @param {() => void} [options.onChange] - Called when a state worth a widget refresh changed.
   */
  constructor({ gladys, store, createClient, probe, onChange }) {
    this.gladys = gladys;
    this.store = store;
    this.createClient = createClient ?? ((options) => new GeckoSpaClient(options));
    this.probe = probe ?? probeHost;
    this.onChange = onChange ?? (() => {});
    /** @type {Map<string, { spaId: string, name: string, host: string, client: GeckoSpaClient, previous: object | null, publishTimer: any, reconnectTimer: any, lostOnce: boolean, pending: Promise<void> | null }>} */
    this.spas = new Map();
    this.config = {};
  }

  setConfig(config) {
    this.config = config;
  }

  // --- Lifecycle ---------------------------------------------------------------------

  /** Reconnect the spas found before, and the one at the configured address. */
  async start() {
    const known = Object.entries(this.store.spas).map(([spaId, spa]) => ({ spaId, ...spa }));
    if (this.config.spa_host && !known.some((spa) => spa.host === this.config.spa_host)) {
      known.push(...(await this.probe(this.config.spa_host)));
    }
    await Promise.all(known.map((spa) => this.add(spa)));
  }

  stop() {
    for (const entry of this.spas.values()) {
      clearTimeout(entry.publishTimer);
      clearTimeout(entry.reconnectTimer);
      entry.client.close();
    }
    this.spas.clear();
  }

  /**
   * Look for in.touch2 modules: through the Gladys core (broadcast), and at
   * the configured address (unicast). Resolves the spas found.
   */
  async scan() {
    const found = new Map();
    try {
      for (const spa of await discoverThroughGladys(this.gladys)) {
        found.set(spa.spaId, spa);
      }
    } catch (err) {
      logger.warn(`Network scan through Gladys failed: ${err.message}`);
    }
    if (this.config.spa_host) {
      for (const spa of await this.probe(this.config.spa_host)) {
        found.set(spa.spaId, spa);
      }
    }
    for (const spa of found.values()) {
      await this.add(spa);
    }
    return [...found.values()];
  }

  /** Track a spa (or update its address) and connect to it. */
  async add({ spaId, name, host }) {
    const existing = this.spas.get(spaId);
    if (existing && existing.host === host) {
      if (!existing.client.connected) {
        await this.connect(existing);
      }
      return existing;
    }
    if (existing) {
      // DHCP gave the module a new address.
      clearTimeout(existing.reconnectTimer);
      existing.client.close();
    }
    const stored = this.store.spas[spaId] ?? {};
    await this.store.upsertSpa(spaId, { name: name ?? stored.name, host });
    const entry = {
      spaId,
      name: name ?? stored.name ?? 'Spa',
      host,
      client: this.createClient({ host, spaId, clientId: this.store.clientId }),
      previous: null,
      publishTimer: null,
      reconnectTimer: null,
      lostOnce: false,
      pending: null,
    };
    this.spas.set(spaId, entry);
    this.wire(entry);
    await this.connect(entry);
    return entry;
  }

  async connect(entry) {
    clearTimeout(entry.reconnectTimer);
    try {
      await entry.client.connect();
      // The 'connected' reaction stores the capabilities: wait for it.
      await entry.pending;
    } catch (err) {
      logger.warn(`Cannot connect to ${entry.spaId} at ${entry.host}: ${err.message}`);
      await this.publishTransports();
      this.scheduleReconnect(entry);
    }
  }

  scheduleReconnect(entry) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = setTimeout(() => this.connect(entry), RECONNECT_DELAY_MS);
    entry.reconnectTimer.unref?.();
  }

  /**
   * Run the reaction to a client event after the previous ones, and keep
   * the promise so callers (and tests) can wait for it.
   */
  track(entry, react) {
    entry.pending = (entry.pending ?? Promise.resolve())
      .then(react)
      .catch((err) => logger.error(`Spa ${entry.spaId}: ${err.message}`));
    return entry.pending;
  }

  async handleConnected(entry) {
    const { client } = entry;
    const capabilities = { ...client.capabilities, watercare: client.watercareMode !== null };
    const stored = this.store.spas[entry.spaId] ?? {};
    if (JSON.stringify(stored.capabilities) !== JSON.stringify(capabilities)) {
      await this.store.upsertSpa(entry.spaId, { capabilities });
      await this.publishDevices();
    }
    if (entry.lostOnce) {
      this.fireTrigger(entry, TRIGGERS.CONNECTION_CHANGED, { state: 'connected' });
    }
    await this.publishTransports();
    await this.publishStates(entry);
    await this.reportConnectionStatus();
  }

  async handleDisconnected(entry) {
    entry.lostOnce = true;
    this.fireTrigger(entry, TRIGGERS.CONNECTION_CHANGED, { state: 'lost' });
    await this.publishTransports();
    await this.reportConnectionStatus();
    this.onChange();
  }

  wire(entry) {
    const { client } = entry;
    client.on('connected', () => this.track(entry, () => this.handleConnected(entry)));
    client.on('disconnected', () => this.track(entry, () => this.handleDisconnected(entry)));
    client.on('update', () => {
      clearTimeout(entry.publishTimer);
      entry.publishTimer = setTimeout(() => {
        this.publishStates(entry).catch((err) =>
          logger.warn(`Cannot publish the states of ${entry.spaId}: ${err.message}`),
        );
      }, PUBLISH_DEBOUNCE_MS);
      entry.publishTimer.unref?.();
    });
    client.on('rf-error', (count) => {
      if (count === RF_DEGRADED_THRESHOLD) {
        this.publishTransports();
      }
    });
  }

  // --- Publication ---------------------------------------------------------------------

  /** The devices of every spa whose capabilities are known. */
  buildDevices() {
    return Object.entries(this.store.spas)
      .filter(([, spa]) => spa.capabilities)
      .map(([spaId, spa]) => buildSpaDevice(this.gladys, { spaId, ...spa }));
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.buildDevices());
  }

  async publishStates(entry) {
    const snapshot = entry.client.snapshot();
    const capabilities = this.store.spas[entry.spaId]?.capabilities;
    if (!snapshot || !capabilities) {
      return;
    }
    const states = buildSpaStates(this.gladys, entry.spaId, capabilities, snapshot);
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: 30 * 60 * 1000 });
    }
    this.detectTransitions(entry, snapshot);
    entry.previous = snapshot;
    this.onChange();
  }

  detectTransitions(entry, snapshot) {
    const { previous } = entry;
    if (!previous) {
      return;
    }
    if (previous.heating !== snapshot.heating) {
      this.fireTrigger(entry, TRIGGERS.HEATING_CHANGED, {
        state: snapshot.heating ? 'started' : 'stopped',
        temperature: snapshot.waterTemperature,
      });
    }
    const reached = (s) =>
      Number.isFinite(s.waterTemperature) &&
      Number.isFinite(s.targetTemperature) &&
      s.waterTemperature >= s.targetTemperature - TEMPERATURE_REACHED_MARGIN;
    if (!reached(previous) && reached(snapshot)) {
      this.fireTrigger(entry, TRIGGERS.TEMPERATURE_REACHED, {
        temperature: snapshot.waterTemperature,
        target_temperature: snapshot.targetTemperature,
      });
    }
  }

  fireTrigger(entry, key, data) {
    const payload = { device: idsOf(this.gladys, entry.spaId).device, ...data };
    for (const [name, value] of Object.entries(payload)) {
      if (value === null || value === undefined) {
        delete payload[name];
      }
    }
    this.gladys
      .publishSceneEvent(key, payload)
      .catch((err) => logger.warn(`Cannot fire ${key}: ${err.message}`));
  }

  transportEntries() {
    return [...this.spas.values()]
      .filter((entry) => this.store.spas[entry.spaId]?.capabilities)
      .map((entry) => {
        const external_id = idsOf(this.gladys, entry.spaId).device;
        if (!entry.client.connected) {
          return { external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
        }
        if (entry.client.rfErrors >= RF_DEGRADED_THRESHOLD) {
          return {
            external_id,
            transport: DEVICE_TRANSPORTS.LOCAL,
            degraded: true,
            message: t('rfDegraded'),
          };
        }
        return { external_id, transport: DEVICE_TRANSPORTS.LOCAL };
      });
  }

  async publishTransports() {
    const entries = this.transportEntries();
    if (entries.length > 0) {
      await this.gladys
        .publishTransports(entries)
        .catch((err) => logger.warn(`Cannot publish the transports: ${err.message}`));
    }
  }

  async reportConnectionStatus() {
    const entries = [...this.spas.values()];
    let status;
    if (entries.length === 0) {
      status = [false, t('noSpa')];
    } else if (entries.some((entry) => !entry.client.connected)) {
      status = [false, t('someUnreachable')];
    } else {
      status = [true];
    }
    await this.gladys.setConnectionStatus(...status).catch(() => {});
  }

  // --- Lookup ------------------------------------------------------------------------

  /** The tracked spa owning a device (or feature) external id. */
  findByExternalId(externalId) {
    for (const entry of this.spas.values()) {
      const deviceId = idsOf(this.gladys, entry.spaId).device;
      if (externalId === deviceId || externalId?.startsWith(`${deviceId}:`)) {
        return entry;
      }
    }
    return null;
  }

  /** The spa a scene or widget targets: the chosen one, else the only one. */
  resolve(deviceExternalId) {
    if (deviceExternalId) {
      const entry = this.findByExternalId(deviceExternalId);
      if (!entry) {
        throw new Error(`Unknown spa ${deviceExternalId}`);
      }
      return entry;
    }
    const [first] = this.spas.values();
    if (!first) {
      throw new Error('No spa found yet');
    }
    return first;
  }

  // --- Commands ----------------------------------------------------------------------

  capabilitiesOf(entry) {
    const capabilities = entry.client.capabilities ?? this.store.spas[entry.spaId]?.capabilities;
    if (!capabilities) {
      throw new Error(`The spa ${entry.spaId} is not connected`);
    }
    return capabilities;
  }

  /** A device feature command from Gladys (onSetValue). */
  async setFeature(device, feature, value) {
    const entry = this.findByExternalId(device.external_id);
    if (!entry) {
      throw new Error(`Unknown spa ${device.external_id}`);
    }
    const ids = idsOf(this.gladys, entry.spaId);
    if (feature.external_id === ids.feature(FEATURES.TARGET_TEMPERATURE)) {
      await this.setTargetTemperature(entry, value);
      return;
    }
    if (feature.external_id === ids.feature(FEATURES.WATERCARE)) {
      await this.setWatercareMode(entry, String(value));
      return;
    }
    const item = this.capabilitiesOf(entry).equipment.find(
      (candidate) => feature.external_id === ids.feature(equipmentFeatureKey(candidate)),
    );
    if (!item) {
      throw new Error(`The feature ${feature.external_id} cannot be controlled`);
    }
    await this.setEquipment(entry, item.key, Number(value) === 1 ? 'HI' : 'OFF');
  }

  /** Resolves the setpoint actually applied (clamped to the spa range). */
  async setTargetTemperature(entry, celsius) {
    const { client } = entry;
    client.ensureConnected();
    const capabilities = this.capabilitiesOf(entry);
    if (!capabilities.canSetTemperature) {
      throw new Error('This spa does not accept a target temperature');
    }
    const write = encodeSetpoint(client.pack, client.block, capabilities, celsius);
    await client.write(write);
    return write.value;
  }

  /**
   * Set a pump, the blower, the waterfall or a light to OFF, LO or HI.
   * Resolves false when the spa has no such equipment.
   */
  async setEquipment(entry, key, speed) {
    const { client } = entry;
    client.ensureConnected();
    const item = this.capabilitiesOf(entry).equipment.find((candidate) => candidate.key === key);
    if (!item) {
      return false;
    }
    const mode = modeForSpeed(item, speed);
    await client.write(encodeDemand(client.pack, client.block, item, mode));
    return true;
  }

  async setWatercareMode(entry, mode) {
    if (!WATERCARE_MODES.includes(mode)) {
      throw new Error(`Unknown watercare mode "${mode}"`);
    }
    return entry.client.setWatercareMode(mode);
  }

  /** Turn off every running pump, the blower, the waterfall and the lights. */
  async stopAll(entry) {
    const { client } = entry;
    client.ensureConnected();
    const snapshot = client.snapshot();
    let stopped = 0;
    for (const item of this.capabilitiesOf(entry).equipment) {
      if (isRunning(snapshot.equipment[item.key])) {
        await client.write(
          encodeDemand(client.pack, client.block, item, modeForSpeed(item, 'OFF')),
        );
        stopped += 1;
      }
    }
    return stopped;
  }

  /** Toggle the first light. Resolves the new state, or null without light. */
  async toggleLight(entry) {
    const { client } = entry;
    client.ensureConnected();
    const light = this.capabilitiesOf(entry).equipment.find((item) => item.kind === 'light');
    if (!light) {
      return null;
    }
    const on = !isRunning(client.snapshot().equipment[light.key]);
    await client.write(
      encodeDemand(
        client.pack,
        client.block,
        light,
        on ? onModeOf(light) : modeForSpeed(light, 'OFF'),
      ),
    );
    return on;
  }

  /** Blink the light so the user can spot the spa. Resolves false without light. */
  async identify(entry, { delayMs = 1500 } = {}) {
    const light = this.capabilitiesOf(entry).equipment.find((item) => item.kind === 'light');
    if (!light) {
      return false;
    }
    for (let i = 0; i < 4; i += 1) {
      await this.toggleLight(entry);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return true;
  }

  clampSetpoint(entry, celsius) {
    return clampSetpoint(this.capabilitiesOf(entry), celsius);
  }
}
