import { StdioServerTransport, serveStdio } from '@modelcontextprotocol/server/stdio';
import type { AppContainer } from './app-container.js';

export async function serveUntilClosed(container: AppContainer): Promise<void> {
  await container.assertFoundationReady();
  let resolveStop: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => { resolveStop = resolve; });
  const requestStop = (): void => { resolveStop?.(); };
  const transport = new StdioServerTransport();
  const originalClose = transport.close.bind(transport);
  transport.close = async (): Promise<void> => {
    await originalClose();
    requestStop();
  };
  const handle = serveStdio(() => container.createServer(), {
    legacy: 'serve',
    transport,
    onerror: (error) => {
      container.logger.error('protocol_transport_error', { error });
      process.exitCode = 4;
      requestStop();
    },
  });
  container.markTransportConnected();
  let terminationSignals = 0;
  const handleTerminationSignal = (): void => {
    terminationSignals += 1;
    requestStop();
    if (terminationSignals > 1) {
      container.rootController.abort();
      void handle.close();
    }
  };
  process.on('SIGINT', handleTerminationSignal);
  process.on('SIGTERM', handleTerminationSignal);
  process.stdin.once('end', requestStop);
  process.stdin.once('close', requestStop);
  container.logger.info('server_started', { transport: 'stdio' });
  try {
    await stopped;
  } finally {
    await container.shutdown(() => handle.close());
    process.off('SIGINT', handleTerminationSignal);
    process.off('SIGTERM', handleTerminationSignal);
    process.stdin.off('end', requestStop);
    process.stdin.off('close', requestStop);
  }
}
