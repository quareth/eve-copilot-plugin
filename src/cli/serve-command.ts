import type { AppConfig } from '../config/config-schema.js';
import { buildContainer } from '../bootstrap/build-container.js';
import { serveUntilClosed } from '../bootstrap/lifecycle.js';

export async function runServeCommand(config: Readonly<AppConfig>): Promise<void> {
  const container = buildContainer(config);
  try {
    await serveUntilClosed(container);
  } catch (error) {
    await container.shutdown();
    throw error;
  }
}
