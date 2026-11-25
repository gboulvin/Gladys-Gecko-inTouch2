// -----------------------------------------------------------------------------
// Finding the in.touch2 modules of the local network.
//
// A module answers a `<HELLO>1</HELLO>` datagram sent to its UDP port 10022.
// The integration container sits on a Docker bridge: a broadcast it emits
// never reaches the LAN. Two ways around it:
//   - the mediated scan (`udp-active-broadcast`, declared in the manifest):
//     the integration forges the HELLO, the Gladys core broadcasts it from the
//     host network and relays the answers;
//   - a unicast HELLO to the address the user typed: unicast crosses the
//     bridge both ways, for a network where broadcasts are filtered.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { createLogger } from '@gladysassistant/integration-sdk';
import { INTOUCH2_PORT, buildHelloBroadcast, parseHello } from './protocol.js';

const logger = createLogger({ name: 'gecko-discovery' });

/**
 * Broadcast a HELLO through the Gladys core and parse the answers.
 * @returns {Promise<Array<{ spaId: string, name: string, host: string }>>}
 */
export async function discoverThroughGladys(gladys, { timeoutSeconds = 4 } = {}) {
  const replies = await gladys.scanNetwork('udp-active-broadcast', {
    port: INTOUCH2_PORT,
    payload: buildHelloBroadcast(),
    timeoutSeconds,
  });
  return parseHelloReplies(
    (replies ?? []).map(({ source_ip: host, payload_base64: payload }) => ({
      host,
      datagram: Buffer.from(payload ?? '', 'base64'),
    })),
  );
}

/**
 * Send a unicast HELLO to one address and collect the answers.
 * @returns {Promise<Array<{ spaId: string, name: string, host: string }>>}
 */
export function probeHost(host, { createSocket, timeoutMs = 3000 } = {}) {
  const socket = (createSocket ?? (() => dgram.createSocket('udp4')))();
  const answers = [];
  return new Promise((resolve) => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closed.
      }
      resolve(parseHelloReplies(answers));
    };
    socket.on('message', (datagram, remote) => {
      answers.push({ host: remote?.address ?? host, datagram });
      // One module per address: no need to wait for the timeout.
      finish();
    });
    socket.on('error', (err) => {
      logger.warn(`HELLO to ${host} failed: ${err.message}`);
      finish();
    });
    socket.bind(0, () => {
      timer = setTimeout(finish, timeoutMs);
      socket.send(buildHelloBroadcast(), INTOUCH2_PORT, host);
    });
  });
}

/** Keep the valid, de-duplicated spa answers. */
export function parseHelloReplies(replies) {
  const spas = new Map();
  for (const { host, datagram } of replies) {
    const hello = parseHello(datagram);
    if (hello && host && !spas.has(hello.spaId)) {
      spas.set(hello.spaId, { ...hello, host });
    }
  }
  return [...spas.values()];
}
