// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of the manifest;
// fetched with `gladys.getConfig()` and hot-reloaded by
// `gladys.onConfigUpdated()`. This module only provides the defaults and
// normalizes the received object.
// -----------------------------------------------------------------------------

// MUST stay consistent with the `default` values of the manifest config_schema.
export const DEFAULT_CONFIG = {
  // Optional address of the in.touch2 module, for networks where the
  // broadcast discovery does not reach it. Empty: broadcast discovery only.
  spa_host: '',
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function isValidHost(host) {
  // Only digits and dots: it must be a real IPv4 address, not a hostname.
  return /^[\d.]+$/.test(host) ? IPV4.test(host) : HOSTNAME.test(host);
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const host = String(raw.spa_host ?? DEFAULT_CONFIG.spa_host).trim();
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // An invalid address is ignored rather than sent to the network.
    spa_host: isValidHost(host) ? host : '',
  };
}
