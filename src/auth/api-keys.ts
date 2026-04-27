import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { IAppConfig, IManagedApiKeyConfig, TManagedApiKeyScope } from '../trigger/types';

export type TApiKeyRequirement = TManagedApiKeyScope;

export interface IManagedApiKeyCreateInput {
  label?: string;
  scopes?: TManagedApiKeyScope[];
  expiresAt?: string;
  quota?: IManagedApiKeyConfig['quota'];
}

export interface ISanitizedManagedApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  keySuffix: string;
  scopes: TManagedApiKeyScope[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  active: boolean;
  quota?: IManagedApiKeyConfig['quota'];
}

export interface IApiKeyVerificationResult {
  ok: boolean;
  source?: 'bootstrap' | 'managed';
  keyId?: string;
  scopes?: TManagedApiKeyScope[];
  quota?: IManagedApiKeyConfig['quota'];
  reason?: 'missing' | 'invalid' | 'expired' | 'revoked' | 'insufficient_scope';
}

export type TAuthAuditOutcome = 'allowed' | 'denied' | 'skipped';

export interface IAuthQuotaUsageSnapshot {
  requestLimit?: number;
  requestsUsed: number;
  tokenLimit?: number;
  tokensUsed: number;
  windowSeconds?: number;
  windowStartedAt?: string;
  windowResetAt?: string;
  estimatedTokens?: number;
}

export interface IAuthAuditEvent {
  timestamp: string;
  outcome: TAuthAuditOutcome;
  required: TApiKeyRequirement;
  method?: string;
  path?: string;
  requestId?: string;
  source?: 'bootstrap' | 'managed';
  keyId?: string;
  scopes?: TManagedApiKeyScope[];
  reason?: string;
  statusCode?: number;
  quota?: IAuthQuotaUsageSnapshot;
}

const VALID_SCOPES: TManagedApiKeyScope[] = ['admin', 'client', 'read-only'];

function createSecret(): string {
  const token = randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `ctr_${token}`;
}

function createKeyId(): string {
  return `key_${randomBytes(8).toString('hex')}`;
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeManagedApiKeyScopes(input: unknown): TManagedApiKeyScope[] {
  if (!Array.isArray(input) || input.length === 0) {
    return ['client'];
  }

  const scopes = Array.from(new Set(
    input
      .map((item) => String(item).trim())
      .filter((item): item is TManagedApiKeyScope => VALID_SCOPES.includes(item as TManagedApiKeyScope))
  ));

  return scopes.length ? scopes : ['client'];
}

export function validateManagedApiKeyScopes(input: unknown): string[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input) || input.length === 0) {
    return ['scopes must be a non-empty array when provided'];
  }
  return input
    .map((item) => String(item).trim())
    .filter((item) => !VALID_SCOPES.includes(item as TManagedApiKeyScope))
    .map((item) => `unsupported scope: ${item}`);
}

export function validateManagedApiKeyQuota(input: unknown): string[] {
  if (input === undefined) {
    return [];
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['quota must be an object when provided'];
  }

  const quota = input as Record<string, unknown>;
  return ['request_limit', 'token_limit', 'window_seconds']
    .filter((field) => quota[field] !== undefined)
    .filter((field) => !Number.isInteger(quota[field]) || Number(quota[field]) <= 0)
    .map((field) => `quota.${field} must be a positive integer`);
}

export function createManagedApiKey(
  input: IManagedApiKeyCreateInput = {},
  now = new Date()
): { secret: string; record: IManagedApiKeyConfig } {
  const secret = createSecret();
  const label = typeof input.label === 'string' && input.label.trim()
    ? input.label.trim()
    : 'client key';
  const record: IManagedApiKeyConfig = {
    id: createKeyId(),
    label,
    key_hash: hashApiKey(secret),
    key_prefix: secret.slice(0, 8),
    key_suffix: secret.slice(-6),
    scopes: normalizeManagedApiKeyScopes(input.scopes),
    created_at: now.toISOString(),
    ...(typeof input.expiresAt === 'string' && input.expiresAt.trim()
      ? { expires_at: input.expiresAt.trim() }
      : {}),
    ...(input.quota ? { quota: input.quota } : {}),
  };

  return { secret, record };
}

export function isManagedApiKeyActive(record: IManagedApiKeyConfig, now = new Date()): boolean {
  if (record.revoked_at) {
    return false;
  }
  if (record.expires_at) {
    const expiresAt = Date.parse(record.expires_at);
    if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
      return false;
    }
  }
  return true;
}

export function sanitizeManagedApiKey(record: IManagedApiKeyConfig, now = new Date()): ISanitizedManagedApiKey {
  return {
    id: record.id,
    label: record.label,
    keyPrefix: record.key_prefix,
    keySuffix: record.key_suffix,
    scopes: record.scopes,
    createdAt: record.created_at,
    expiresAt: record.expires_at,
    revokedAt: record.revoked_at,
    active: isManagedApiKeyActive(record, now),
    quota: record.quota,
  };
}

export function listManagedApiKeys(config: Partial<IAppConfig>, now = new Date()): ISanitizedManagedApiKey[] {
  return (config.Auth?.managed_keys ?? []).map((record) => sanitizeManagedApiKey(record, now));
}

export function managedApiKeySummary(config: Partial<IAppConfig>, now = new Date()) {
  const keys = listManagedApiKeys(config, now);
  return {
    total: keys.length,
    active: keys.filter((item) => item.active).length,
    revoked: keys.filter((item) => item.revokedAt).length,
    expired: keys.filter((item) => !item.active && !item.revokedAt).length,
  };
}

export function scopeAllows(scopes: TManagedApiKeyScope[], required: TApiKeyRequirement): boolean {
  if (scopes.includes('admin')) {
    return true;
  }
  if (required === 'read-only') {
    return scopes.includes('client') || scopes.includes('read-only');
  }
  if (required === 'client') {
    return scopes.includes('client');
  }
  return false;
}

export function verifyApiKey(
  config: Partial<IAppConfig>,
  providedKey: string | undefined,
  required: TApiKeyRequirement = 'client',
  now = new Date()
): IApiKeyVerificationResult {
  if (!providedKey) {
    return { ok: false, reason: 'missing' };
  }

  if (config.APIKEY && safeEqual(providedKey, config.APIKEY)) {
    return {
      ok: true,
      source: 'bootstrap',
      scopes: ['admin'],
    };
  }

  const providedHash = hashApiKey(providedKey);
  const record = (config.Auth?.managed_keys ?? []).find((item) => safeEqual(item.key_hash, providedHash));
  if (!record) {
    return { ok: false, reason: 'invalid' };
  }
  if (record.revoked_at) {
    return { ok: false, source: 'managed', keyId: record.id, reason: 'revoked' };
  }
  if (!isManagedApiKeyActive(record, now)) {
    return { ok: false, source: 'managed', keyId: record.id, reason: 'expired' };
  }
  if (!scopeAllows(record.scopes, required)) {
    return { ok: false, source: 'managed', keyId: record.id, reason: 'insufficient_scope' };
  }

  return {
    ok: true,
    source: 'managed',
    keyId: record.id,
    scopes: record.scopes,
    quota: record.quota,
  };
}

export function extractApiKeyFromHeaders(headers: Record<string, any> | undefined): string | undefined {
  const authHeader = headers?.authorization ?? headers?.Authorization;
  const xApiKey = headers?.['x-api-key'] ?? headers?.['X-Api-Key'];

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (Array.isArray(xApiKey)) {
    return xApiKey[0];
  }
  return typeof xApiKey === 'string' ? xApiKey : undefined;
}

export class AuthAuditStore {
  private events: IAuthAuditEvent[] = [];

  constructor(private readonly max = 200) {}

  add(event: Omit<IAuthAuditEvent, 'timestamp'> & { timestamp?: string }): IAuthAuditEvent {
    const recorded = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.events.unshift(recorded);
    if (this.events.length > this.max) {
      this.events = this.events.slice(0, this.max);
    }
    return recorded;
  }

  list(limit = 50): IAuthAuditEvent[] {
    return this.events.slice(0, Math.max(0, Math.min(limit, this.max))).map((event) => ({
      ...event,
      scopes: event.scopes ? [...event.scopes] : undefined,
    }));
  }

  summary() {
    const total = this.events.length;
    const denied = this.events.filter((event) => event.outcome === 'denied').length;
    const allowed = this.events.filter((event) => event.outcome === 'allowed').length;
    const skipped = this.events.filter((event) => event.outcome === 'skipped').length;
    const managed = this.events.filter((event) => event.source === 'managed').length;
    const bootstrap = this.events.filter((event) => event.source === 'bootstrap').length;
    const byReason = this.events.reduce<Record<string, number>>((acc, event) => {
      const reason = event.reason ?? event.outcome;
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total,
      allowed,
      denied,
      skipped,
      managed,
      bootstrap,
      byReason,
      latestAt: this.events[0]?.timestamp,
    };
  }

  clear(): void {
    this.events = [];
  }
}

export const authAuditStore = new AuthAuditStore();

type TQuotaDenyReason = 'request_quota_exceeded' | 'token_quota_exceeded';
type TQuotaUsageEntry = { requests: number; tokens: number; windowStartedAt: number; windowSeconds?: number };

export class AuthQuotaUsageStore {
  private usage = new Map<string, TQuotaUsageEntry>();

  consume(
    keyId: string | undefined,
    quota: IManagedApiKeyConfig['quota'] | undefined,
    estimatedTokens = 0,
    now = new Date()
  ): { ok: true; usage?: IAuthQuotaUsageSnapshot } | { ok: false; reason: TQuotaDenyReason; usage: IAuthQuotaUsageSnapshot } {
    if (!keyId || !quota) {
      return { ok: true };
    }

    const requestLimit = Number.isInteger(quota.request_limit) && Number(quota.request_limit) > 0
      ? Number(quota.request_limit)
      : undefined;
    const tokenLimit = Number.isInteger(quota.token_limit) && Number(quota.token_limit) > 0
      ? Number(quota.token_limit)
      : undefined;
    const windowSeconds = Number.isInteger(quota.window_seconds) && Number(quota.window_seconds) > 0
      ? Number(quota.window_seconds)
      : undefined;

    if (requestLimit === undefined && tokenLimit === undefined) {
      return { ok: true };
    }

    const nowMs = now.getTime();
    const existing = this.usage.get(keyId) ?? { requests: 0, tokens: 0, windowStartedAt: nowMs, windowSeconds };
    const windowExpired = windowSeconds !== undefined && (
      existing.windowSeconds !== windowSeconds || nowMs - existing.windowStartedAt >= windowSeconds * 1000
    );
    const current = windowExpired
      ? { requests: 0, tokens: 0, windowStartedAt: nowMs, windowSeconds }
      : { ...existing, windowSeconds };
    const tokensToAdd = Math.max(0, Math.ceil(estimatedTokens));
    const currentSnapshot = {
      requestLimit,
      requestsUsed: current.requests,
      tokenLimit,
      tokensUsed: current.tokens,
      windowSeconds,
      windowStartedAt: new Date(current.windowStartedAt).toISOString(),
      windowResetAt: windowSeconds !== undefined
        ? new Date(current.windowStartedAt + windowSeconds * 1000).toISOString()
        : undefined,
      estimatedTokens: tokensToAdd,
    };

    if (requestLimit !== undefined && current.requests >= requestLimit) {
      return {
        ok: false,
        reason: 'request_quota_exceeded',
        usage: currentSnapshot,
      };
    }
    if (tokenLimit !== undefined && current.tokens + tokensToAdd > tokenLimit) {
      return {
        ok: false,
        reason: 'token_quota_exceeded',
        usage: currentSnapshot,
      };
    }

    const next = {
      requests: current.requests + 1,
      tokens: current.tokens + tokensToAdd,
      windowStartedAt: current.windowStartedAt,
      windowSeconds,
    };
    this.usage.set(keyId, next);
    return {
      ok: true,
      usage: {
        requestLimit,
        requestsUsed: next.requests,
        tokenLimit,
        tokensUsed: next.tokens,
        windowSeconds,
        windowStartedAt: new Date(next.windowStartedAt).toISOString(),
        windowResetAt: windowSeconds !== undefined
          ? new Date(next.windowStartedAt + windowSeconds * 1000).toISOString()
          : undefined,
        estimatedTokens: tokensToAdd,
      },
    };
  }

  summary(now = new Date()) {
    const nowMs = now.getTime();
    const entries = Array.from(this.usage.entries()).map(([key, item]) => {
      if (item.windowSeconds !== undefined && nowMs - item.windowStartedAt >= item.windowSeconds * 1000) {
        const reset = {
          requests: 0,
          tokens: 0,
          windowStartedAt: nowMs,
          windowSeconds: item.windowSeconds,
        };
        this.usage.set(key, reset);
        return [key, reset] as const;
      }
      return [key, item] as const;
    });
    const windowResetAts = entries
      .map(([, item]) => item.windowSeconds !== undefined
        ? item.windowStartedAt + item.windowSeconds * 1000
        : undefined)
      .filter((value): value is number => value !== undefined);
    return {
      trackedKeys: entries.length,
      requestsUsed: entries.reduce((total, [, item]) => total + item.requests, 0),
      tokensUsed: entries.reduce((total, [, item]) => total + item.tokens, 0),
      windowResetAt: windowResetAts.length > 0
        ? new Date(Math.min(...windowResetAts)).toISOString()
        : undefined,
    };
  }

  clear(): void {
    this.usage.clear();
  }
}

export const authQuotaUsageStore = new AuthQuotaUsageStore();
