// -----------------------------------------------------------------------------
// UDP client of ONE spa (one in.touch2 module).
//
// Connection sequence (same as the official app):
//   1. AVERS -> SVERS   firmware versions;
//   2. CURCH -> CHCUR   radio channel and signal between the EN and CO modules;
//   3. SFILE -> FILES   controller platform + memory map versions;
//   4. STATU -> STATV*  the whole status block, in segments;
//   5. GETWC -> WCGET   the active watercare mode.
// Then the client pings every few seconds (APING): as long as it does, the spa
// pushes every change of its status block (STATP), which the client
// acknowledges (STATQ). The whole block is re-read every few minutes, in case
// a push was lost. Commands write the status block (SPACK -> PACKS).
//
// Only unicast UDP is used here: it crosses the Docker bridge, both ways.
//
// Events:
//   'update'       the status block or the watercare mode changed;
//   'connected'    the spa answered the connection sequence;
//   'disconnected' the spa stopped answering the pings;
//   'rf-error'     the in.touch2 module cannot reach the spa (RFERR).
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { createLogger } from '@gladysassistant/integration-sdk';
import {
  INTOUCH2_PORT,
  STATUS_BLOCK_SIZE,
  VERBS,
  WATERCARE_MODES,
  buildPacket,
  parseChannel,
  parseConfigFile,
  parsePacket,
  parseStatusPush,
  parseStatusSegment,
  parseVersion,
  parseWatercare,
  requests,
  verbOf,
} from './protocol.js';
import { loadPack } from './packs.js';
import { capabilitiesOf, snapshotOf } from './model.js';

const logger = createLogger({ name: 'gecko-client' });

export const DEFAULT_TIMINGS = {
  requestTimeoutMs: 4000,
  retries: 3,
  statusBlockTimeoutMs: 12000,
  pingIntervalMs: 3000,
  // No answer to the pings for this long: the spa is considered lost.
  pingLossMs: 30000,
  resyncIntervalMs: 5 * 60 * 1000,
  channelIntervalMs: 10 * 60 * 1000,
};

export class GeckoSpaClient extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host - IP address of the in.touch2 module.
   * @param {string} options.spaId - Identifier from the HELLO answer.
   * @param {string} options.clientId - Our identifier, `IOS` + a stable UUID.
   * @param {number} [options.port]
   * @param {() => import('node:dgram').Socket} [options.createSocket]
   * @param {Partial<typeof DEFAULT_TIMINGS>} [options.timings]
   */
  constructor({ host, spaId, clientId, port = INTOUCH2_PORT, createSocket, timings = {} }) {
    super();
    this.host = host;
    this.port = port;
    this.spaId = spaId;
    this.clientId = clientId;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.createSocket = createSocket ?? (() => dgram.createSocket('udp4'));
    this.socket = null;
    this.waiters = new Set();
    this.timers = [];
    this.protocolSequence = 0;
    this.commandSequence = 191;
    this.connected = false;
    this.lastPong = 0;
    this.rfErrors = 0;
    this.block = Buffer.alloc(STATUS_BLOCK_SIZE);
    this.pack = null;
    this.capabilities = null;
    this.versions = null;
    this.channel = null;
    this.watercareMode = null;
  }

  // --- Lifecycle -----------------------------------------------------------------

  async connect() {
    this.close();
    this.socket = this.createSocket();
    this.socket.on('message', (message, remote) => this.onDatagram(message, remote));
    this.socket.on('error', (err) => logger.warn(`Socket error (${this.host}): ${err.message}`));
    await new Promise((resolve) => this.socket.bind(0, resolve));

    this.versions = parseVersion(
      await this.request(() => requests.version(this.nextSequence()), VERBS.VERSION_RESPONSE),
    );
    this.channel = parseChannel(
      await this.request(() => requests.channel(this.nextSequence()), VERBS.CHANNEL_RESPONSE),
    );
    const files = parseConfigFile(
      await this.request(() => requests.configFile(this.nextSequence()), VERBS.FILE_RESPONSE),
    );
    if (!files) {
      throw new Error('The spa sent an unreadable configuration file name');
    }
    this.files = files;
    this.pack = loadPack(files.platform, files.configVersion, files.logVersion);
    await this.readStatusBlock();
    this.capabilities = capabilitiesOf(this.pack, this.block);
    await this.refreshWatercare().catch((err) =>
      logger.debug(`No watercare mode for ${this.spaId}: ${err.message}`),
    );

    this.connected = true;
    this.lastPong = Date.now();
    this.startTimers();
    logger.info(
      `Connected to ${this.spaId} (${files.platform} C${files.configVersion}/S${files.logVersion}) at ${this.host}`,
    );
    this.emit('connected');
  }

  close() {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    for (const waiter of this.waiters) {
      waiter.reject(new Error('Connection closed'));
    }
    this.waiters.clear();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Already closed.
      }
      this.socket = null;
    }
    this.connected = false;
  }

  startTimers() {
    const { pingIntervalMs, resyncIntervalMs, channelIntervalMs } = this.timings;
    this.timers.push(setInterval(() => this.ping(), pingIntervalMs));
    this.timers.push(
      setInterval(() => {
        if (this.connected) {
          this.readStatusBlock()
            .then(() => this.emit('update'))
            .catch((err) => logger.debug(`Resync of ${this.spaId} failed: ${err.message}`));
        }
      }, resyncIntervalMs),
    );
    this.timers.push(
      setInterval(() => {
        if (this.connected) {
          this.request(() => requests.channel(this.nextSequence()), VERBS.CHANNEL_RESPONSE)
            .then((payload) => {
              this.channel = parseChannel(payload);
              this.emit('update');
            })
            .catch(() => {});
        }
      }, channelIntervalMs),
    );
    for (const timer of this.timers) {
      timer.unref?.();
    }
  }

  async ping() {
    try {
      await this.request(() => requests.ping(), VERBS.PING, { retries: 1 });
      this.lastPong = Date.now();
      if (!this.connected) {
        // The spa answers again: re-read everything it may have changed.
        await this.readStatusBlock();
        this.connected = true;
        logger.info(`${this.spaId} answers again`);
        this.emit('connected');
      }
    } catch {
      if (this.connected && Date.now() - this.lastPong > this.timings.pingLossMs) {
        this.connected = false;
        logger.warn(`${this.spaId} stopped answering at ${this.host}`);
        this.emit('disconnected');
      }
    }
  }

  // --- State -----------------------------------------------------------------------

  snapshot() {
    if (!this.pack || !this.capabilities) {
      return null;
    }
    return {
      ...snapshotOf(this.pack, this.block, this.capabilities),
      watercareMode: this.watercareMode,
      signal: this.channel?.signal ?? null,
      connected: this.connected,
      rfErrors: this.rfErrors,
    };
  }

  async readStatusBlock() {
    const segments = await this.collectStatusBlock();
    const data = Buffer.concat(segments);
    data.copy(this.block, 0, 0, Math.min(data.length, this.block.length));
  }

  async collectStatusBlock() {
    let lastError;
    for (let attempt = 0; attempt < this.timings.retries; attempt += 1) {
      const segments = [];
      let expected = 0;
      try {
        await this.exchange(
          requests.statusBlock(this.nextSequence(), 0, STATUS_BLOCK_SIZE),
          (payload) => {
            if (verbOf(payload) !== VERBS.STATUS_RESPONSE) {
              return false;
            }
            const segment = parseStatusSegment(payload);
            if (!segment || segment.index !== expected) {
              return false;
            }
            segments.push(segment.data);
            expected = segment.next;
            return segment.next === 0;
          },
          this.timings.statusBlockTimeoutMs,
        );
        return segments;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async refreshWatercare() {
    const payload = await this.request(
      () => requests.getWatercare(this.nextSequence()),
      VERBS.WATERCARE_GET_RESPONSE,
    );
    this.watercareMode = WATERCARE_MODES[parseWatercare(payload)] ?? null;
  }

  // --- Commands ----------------------------------------------------------------------

  /**
   * Write bytes of the status block, then reflect them locally.
   * @param {{ pos: number, data: Buffer }} write
   */
  async write({ pos, data }) {
    this.ensureConnected();
    await this.request(
      () =>
        requests.setValue({
          seq: this.nextCommandSequence(),
          packType: this.pack.packType,
          configVersion: this.files.configVersion,
          logVersion: this.files.logVersion,
          pos,
          data,
        }),
      VERBS.PACK_COMMAND_RESPONSE,
    );
    data.copy(this.block, pos);
    this.emit('update');
  }

  /** @param {string} mode - One of WATERCARE_MODES. */
  async setWatercareMode(mode) {
    this.ensureConnected();
    const index = WATERCARE_MODES.indexOf(mode);
    if (index === -1) {
      throw new Error(`Unknown watercare mode "${mode}"`);
    }
    const payload = await this.request(
      () => requests.setWatercare(this.nextSequence(), index),
      VERBS.WATERCARE_SET_RESPONSE,
    );
    this.watercareMode = WATERCARE_MODES[parseWatercare(payload)] ?? mode;
    this.emit('update');
    return this.watercareMode;
  }

  ensureConnected() {
    if (!this.connected || !this.pack) {
      throw new Error(`The spa ${this.spaId} is not connected`);
    }
  }

  // --- Transport -----------------------------------------------------------------------

  nextSequence() {
    this.protocolSequence = this.protocolSequence >= 191 ? 1 : this.protocolSequence + 1;
    return this.protocolSequence;
  }

  nextCommandSequence() {
    this.commandSequence = this.commandSequence >= 255 ? 192 : this.commandSequence + 1;
    return this.commandSequence;
  }

  send(payload) {
    if (!this.socket) {
      throw new Error('Socket closed');
    }
    this.socket.send(buildPacket(this.clientId, this.spaId, payload), this.port, this.host);
  }

  /**
   * Send a request and resolve the payload of its answer (first datagram
   * whose verb is `expectedVerb`), with retries.
   * @param {() => Buffer} build - Builds the request (a fresh sequence per try).
   */
  async request(build, expectedVerb, { retries = this.timings.retries } = {}) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        let answer;
        await this.exchange(
          build(),
          (payload) => {
            if (verbOf(payload) !== expectedVerb) {
              return false;
            }
            answer = payload;
            return true;
          },
          this.timings.requestTimeoutMs,
        );
        return answer;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  /** Send one datagram and wait until `accept` returns true for an answer. */
  exchange(payload, accept, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = {
        accept,
        resolve: () => {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          resolve();
        },
        reject: (err) => {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          reject(err);
        },
      };
      waiter.timer = setTimeout(
        () => waiter.reject(new Error(`No answer from ${this.spaId} (${verbOf(payload)})`)),
        timeoutMs,
      );
      this.waiters.add(waiter);
      try {
        this.send(payload);
      } catch (err) {
        waiter.reject(err);
      }
    });
  }

  onDatagram(message, remote) {
    if (remote?.address && remote.address !== this.host) {
      return;
    }
    const packet = parsePacket(message);
    if (!packet || packet.source !== this.spaId) {
      return;
    }
    const { payload } = packet;
    const verb = verbOf(payload);

    if (verb === VERBS.STATUS_PUSH) {
      this.onStatusPush(payload);
      return;
    }
    if (verb === VERBS.RF_ERROR) {
      this.rfErrors += 1;
      this.emit('rf-error', this.rfErrors);
    }
    for (const waiter of [...this.waiters]) {
      if (waiter.accept(payload)) {
        waiter.resolve();
        return;
      }
    }
  }

  onStatusPush(payload) {
    try {
      this.send(requests.statusPushAck(this.nextCommandSequence()));
    } catch {
      // Socket closed meanwhile.
    }
    const changes = parseStatusPush(payload);
    for (const { pos, data } of changes) {
      if (pos + data.length <= this.block.length) {
        data.copy(this.block, pos);
      }
    }
    if (changes.length > 0) {
      this.rfErrors = 0;
      this.emit('update');
    }
  }
}
