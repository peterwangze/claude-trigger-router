export const SERVICE_NAME = 'claude-trigger-router';
export const SERVICE_HEALTH_PATH = '/api/health';

export function isExpectedServiceHealth(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const health = payload as {
    service?: unknown;
    ready?: unknown;
  };

  return health.service === SERVICE_NAME && health.ready === true;
}

export async function probeServiceHealth(port: number, timeoutMs = 500): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${SERVICE_HEALTH_PATH}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return false;
    }

    return isExpectedServiceHealth(await res.json());
  } catch {
    return false;
  }
}

export async function waitForService(port: number, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeServiceHealth(port, 500)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}
