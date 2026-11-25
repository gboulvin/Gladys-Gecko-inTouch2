// -----------------------------------------------------------------------------
// Persistent state, in the only writable volume of the container (/data).
//
//   - clientId: our identifier towards the spas (`IOS` + a UUID), stable across
//     restarts like the one of the official app;
//   - spas: the modules found so far ({ host, name, capabilities }), so they
//     are reconnected at startup without a new scan, and their devices can be
//     listed while a spa is unreachable.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = process.env.GECKO_DATA_DIR ?? '/data';

export class Store {
  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.file = path.join(dataDir, 'gecko-intouch2.json');
    this.state = { clientId: null, spas: {} };
  }

  async load() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = { clientId: saved.clientId ?? null, spas: saved.spas ?? {} };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.file}, starting fresh: ${err.message}`);
      }
    }
    if (!this.state.clientId) {
      this.state.clientId = `IOS${randomUUID()}`;
      await this.save();
    }
    return this.state;
  }

  async save() {
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`);
      await rename(temporary, this.file);
    } catch (err) {
      // Not fatal: the spas are found again by the next scan.
      logger.warn(`Cannot write ${this.file}: ${err.message}`);
    }
  }

  get clientId() {
    return this.state.clientId;
  }

  get spas() {
    return this.state.spas;
  }

  async upsertSpa(spaId, data) {
    this.state.spas[spaId] = { ...this.state.spas[spaId], ...data };
    await this.save();
  }

  async removeSpa(spaId) {
    delete this.state.spas[spaId];
    await this.save();
  }
}
