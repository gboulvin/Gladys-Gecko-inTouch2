// A spa manager wired to the SDK's fake Gladys and to in-memory fake spas.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { GeckoSpaClient } from '../../src/gecko/client.js';
import { SpaManager } from '../../src/spaManager.js';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { normalizeConfig } from '../../src/config.js';
import { FakeSpa, settle } from './fakeSpa.js';

export const FAST_TIMINGS = {
  requestTimeoutMs: 200,
  statusBlockTimeoutMs: 400,
  retries: 2,
  pingIntervalMs: 60_000,
  resyncIntervalMs: 60_000,
  channelIntervalMs: 60_000,
};

export async function setup({ spas = [new FakeSpa()], config = {} } = {}) {
  const gladys = createFakeGladys({ config });
  gladys.fake.scanResults = {
    'udp-active-broadcast': spas.map((spa) => spa.helloScanResult()),
  };
  const store = new Store(await mkdtemp(path.join(tmpdir(), 'gecko-')));
  await store.load();
  const byHost = new Map(spas.map((spa) => [spa.host, spa]));
  const createManager = (_gladys, _store, onChange) =>
    new SpaManager({
      gladys,
      store,
      onChange,
      createClient: (options) =>
        new GeckoSpaClient({
          ...options,
          createSocket: () => byHost.get(options.host).createSocket(),
          timings: FAST_TIMINGS,
        }),
      probe: async (host) => {
        const spa = byHost.get(host);
        return spa ? [{ spaId: spa.spaId, name: spa.name, host }] : [];
      },
    });
  const manager = registerHandlers({ gladys, store, createManager });
  manager.setConfig(normalizeConfig(config));
  return { gladys, store, manager, spas };
}

/** Scan, publish the devices and wait for the first states. */
export async function scanned(options) {
  const context = await setup(options);
  await context.manager.scan();
  await context.manager.publishDevices();
  await settle();
  for (const entry of context.manager.spas.values()) {
    await context.manager.publishStates(entry);
  }
  return context;
}

export function teardown({ manager }) {
  manager.stop();
}
