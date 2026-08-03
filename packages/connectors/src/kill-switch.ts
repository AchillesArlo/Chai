import { randomUUID } from 'node:crypto';

// ponytail: in-memory kill switch store. Swap for Postgres when persistence is needed.
// Three layers: env (global), DB (per-tenant), owner toggle (per-provider). All must be off.

/**
 * Connector provider identifiers.
 *
 * `community-channel` is deliberately separate from `channel`: the unofficial
 * WhatsApp Web gateway (FASE 25) must be quarantined without touching a tenant's
 * official channel, and vice versa.
 *
 * `ai-reply` is not a connector but the automatic AI reply pipeline (FASE 31).
 * It shares this switch so the env (`KILL_SWITCH_AI_REPLY=1`) and owner-console
 * layers can halt all automated replies process-wide; the per-tenant per-channel
 * toggle lives in chai.ai_reply_setting (migration 0096).
 */
export type KillSwitchProvider =
  | 'payment'
  | 'channel'
  | 'community-channel'
  | 'logistics'
  | 'calendar'
  | 'ai-reply';

/**
 * Kill switch source: where the toggle came from.
 */
export type KillSwitchSource = 'env' | 'db' | 'owner';

/**
 * A single kill switch state record.
 */
export interface KillSwitchState {
  provider: KillSwitchProvider;
  reason?: string;
  source: KillSwitchSource;
  tenantId?: string;
  triggeredAt: Date;
  tripped: boolean;
}

/**
 * Owner toggle override (highest precedence).
 */
interface OwnerToggle {
  provider: KillSwitchProvider;
  reason: string;
  tripped: boolean;
}

/**
 * Runtime kill switch registry.
 *
 * Resolution order (any tripped layer trips the switch):
 * 1. env (global) — KILL_SWITCH_PAYMENT=1 etc.
 * 2. db (per-tenant) — persisted toggles from connector_config.
 * 3. owner (per-provider) — owner-console manual override.
 */
export class KillSwitchRuntime {
  private dbToggles: Map<string, boolean> = new Map();
  private ownerToggles: Map<KillSwitchProvider, OwnerToggle> = new Map();
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  /**
   * Check env var KILL_SWITCH_<PROVIDER>=1 (global).
   */
  private isEnvTripped(provider: KillSwitchProvider): boolean {
    const key = `KILL_SWITCH_${provider.toUpperCase().replace('-', '_')}`;
    return this.env[key] === '1' || this.env[key] === 'true';
  }

  /**
   * Check per-tenant DB toggle.
   */
  private isDbTripped(provider: KillSwitchProvider, tenantId?: string): boolean {
    if (!tenantId) return false;
    return this.dbToggles.get(`${tenantId}:${provider}`) === true;
  }

  /**
   * Check owner toggle.
   */
  private isOwnerTripped(provider: KillSwitchProvider): boolean {
    return this.ownerToggles.get(provider)?.tripped === true;
  }

  /**
   * Is the kill switch tripped for this provider + tenant?
   */
  isTripped(provider: KillSwitchProvider, tenantId?: string): boolean {
    return (
      this.isEnvTripped(provider) ||
      this.isDbTripped(provider, tenantId) ||
      this.isOwnerTripped(provider)
    );
  }

  /**
   * Get the full state of all kill switch layers for a provider + tenant.
   */
  getState(provider: KillSwitchProvider, tenantId?: string): KillSwitchState[] {
    const states: KillSwitchState[] = [];

    if (this.isEnvTripped(provider)) {
      states.push({
        provider,
        reason: 'Environment-level kill switch',
        source: 'env',
        tenantId,
        triggeredAt: new Date(),
        tripped: true,
      });
    }

    if (this.isDbTripped(provider, tenantId)) {
      states.push({
        provider,
        reason: 'Database-level kill switch',
        source: 'db',
        tenantId,
        triggeredAt: new Date(),
        tripped: true,
      });
    }

    const owner = this.ownerToggles.get(provider);
    if (owner?.tripped) {
      states.push({
        provider,
        reason: owner.reason,
        source: 'owner',
        tenantId,
        triggeredAt: new Date(),
        tripped: true,
      });
    }

    return states;
  }

  /**
   * Set a per-tenant DB toggle.
   */
  setDbToggle(provider: KillSwitchProvider, tenantId: string, tripped: boolean): void {
    this.dbToggles.set(`${tenantId}:${provider}`, tripped);
  }

  /**
   * Set an owner-console manual override.
   */
  setOwnerToggle(provider: KillSwitchProvider, tripped: boolean, reason: string): void {
    this.ownerToggles.set(provider, { provider, reason, tripped });
  }

  /**
   * Clear an owner toggle.
   */
  clearOwnerToggle(provider: KillSwitchProvider): void {
    this.ownerToggles.delete(provider);
  }

  /**
   * Clear all DB toggles for a tenant.
   */
  clearDbToggles(tenantId: string): void {
    const keys = [...this.dbToggles.keys()].filter((k) => k.startsWith(`${tenantId}:`));
    for (const key of keys) {
      this.dbToggles.delete(key);
    }
  }

  /**
   * Reset all toggles (for testing).
   */
  reset(): void {
    this.dbToggles.clear();
    this.ownerToggles.clear();
  }
}

/**
 * Default singleton instance.
 */
let defaultRuntime: KillSwitchRuntime | null = null;

/**
 * Get or create the default kill switch runtime.
 */
export function getKillSwitchRuntime(env: NodeJS.ProcessEnv = process.env): KillSwitchRuntime {
  if (!defaultRuntime) {
    defaultRuntime = new KillSwitchRuntime(env);
  }
  return defaultRuntime;
}

/**
 * Reset the default runtime (for testing).
 */
export function resetKillSwitchRuntime(): void {
  defaultRuntime = null;
}

/**
 * Generate a unique event ID for kill switch audit logs.
 */
export function generateKillSwitchEventId(): string {
  return randomUUID();
}
