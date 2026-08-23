import type { AppConfig } from '../config/config-schema.js';
import { buildContainer } from '../bootstrap/build-container.js';

export async function runDoctorCommand(
  config: Readonly<AppConfig>,
  write: (value: string) => void = (value) => process.stdout.write(value),
): Promise<void> {
  const container = buildContainer(config);
  try {
    const result = await container.services.getServerDiagnostics.execute({}, {
      requestId: 'doctor',
      signal: container.rootController.signal,
    });
    write(`${JSON.stringify(result.data, null, 2)}\n`);
    if (result.data.overall === 'unavailable') process.exitCode = 3;
  } finally {
    await container.shutdown();
  }
}
