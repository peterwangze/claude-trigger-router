import { Socket } from 'net';
import type { IRuntimeConfig } from './trigger/types';

export const SERVICE_NAME = 'claude-trigger-router';
export const SERVICE_HEALTH_PATH = '/api/health';
export const SERVICE_INFO_PATH = '/api/service-info';

export interface IRemoteServiceStatusSummary {
  enabled: boolean;
  configured: boolean;
  reachable: boolean;
  ready: boolean;
  baseUrl: string;
  service?: unknown;
  runtimeMode?: unknown;
  remoteEnabled?: unknown;
  auth?: unknown;
  security?: unknown;
  error?: string;
}

export interface IServiceHealthProbeOptions {
  apiKey?: string;
}

function buildServiceHealthHeaders(options: IServiceHealthProbeOptions = {}): Record<string, string> | undefined {
  const apiKey = options.apiKey?.trim();
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
}

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

export async function probeServiceHealth(
  port: number,
  timeoutMs = 500,
  options: IServiceHealthProbeOptions = {}
): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${SERVICE_HEALTH_PATH}`, {
      headers: buildServiceHealthHeaders(options),
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

export async function probeRemoteServiceStatus(
  remoteService: NonNullable<IRuntimeConfig['remote_service']> | undefined,
  timeoutMs = 800,
  fetchFn: typeof fetch = fetch
): Promise<IRemoteServiceStatusSummary> {
  const enabled = Boolean(remoteService?.enabled);
  const baseUrl = remoteService?.base_url?.trim() ?? '';
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  if (!enabled) {
    return {
      enabled: false,
      configured: false,
      reachable: false,
      ready: false,
      baseUrl: normalizedBaseUrl,
    };
  }

  if (!baseUrl) {
    return {
      enabled: true,
      configured: false,
      reachable: false,
      ready: false,
      baseUrl: normalizedBaseUrl,
      error: 'Runtime.remote_service.base_url is required when remote_service is enabled',
    };
  }

  try {
    const headers: Record<string, string> = {};
    if (remoteService?.auth_token) {
      headers.Authorization = `Bearer ${remoteService.auth_token}`;
    }
    const res = await fetchFn(`${normalizedBaseUrl}${SERVICE_INFO_PATH}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return {
        enabled: true,
        configured: true,
        reachable: false,
        ready: false,
        baseUrl: normalizedBaseUrl,
        error: `HTTP ${res.status}`,
      };
    }

    const payload = await res.json();
    const info = payload && typeof payload === 'object'
      ? payload as {
          service?: unknown;
          ready?: unknown;
          runtimeMode?: unknown;
          remoteEnabled?: unknown;
          auth?: unknown;
          security?: unknown;
        }
      : {};
    return {
      enabled: true,
      configured: true,
      reachable: true,
      ready: isExpectedServiceHealth(payload),
      baseUrl: normalizedBaseUrl,
      service: info.service,
      runtimeMode: info.runtimeMode,
      remoteEnabled: info.remoteEnabled,
      ...(info.auth !== undefined ? { auth: info.auth } : {}),
      ...(info.security !== undefined ? { security: info.security } : {}),
    };
  } catch (error: any) {
    return {
      enabled: true,
      configured: true,
      reachable: false,
      ready: false,
      baseUrl: normalizedBaseUrl,
      error: error?.message || String(error),
    };
  }
}

export async function isTcpPortOccupied(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') {
        finish(false);
        return;
      }
      finish(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}

export async function waitForService(
  port: number,
  timeoutMs = 5000,
  options: IServiceHealthProbeOptions = {}
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeServiceHealth(port, 500, options)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}
