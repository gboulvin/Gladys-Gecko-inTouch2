// -----------------------------------------------------------------------------
// Entry point of the Gecko in.touch2 integration for Gladys Assistant.
//
// The three GLADYS_* environment variables (host API URL, integration token,
// selector) are injected by the Gladys supervisor and read by the SDK. The
// handlers live in src/app.js; the spa logic in src/spaManager.js.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';
import { Store } from './src/store.js';

const gladys = new GladysIntegration();
const manager = registerHandlers({ gladys, store: new Store() });

// The SDK disconnects cleanly and exits 0 on SIGTERM/SIGINT.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  manager.stop();
});

logger.info('Starting the Gecko in.touch2 integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
