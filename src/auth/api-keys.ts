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
  reason?: 'missing' | 'invalid' | 'expired' | 'revoked' | 'insufficient_scope';
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
