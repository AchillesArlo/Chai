// ponytail: auto-assignment engine — round-robin + skill-based.
// In-memory state; swap for a DB-backed roster when persistence is needed.

/**
 * Agent profile for assignment.
 */
export interface AgentProfile {
  agentId: string;
  active: boolean;
  skills: string[];
  tenantId: string;
}

/**
 * Assignment strategy.
 */
export type AssignmentStrategy = 'round-robin' | 'skill-based';

/**
 * Assignment result.
 */
export interface AssignmentResult {
  agentId: string | null;
  reason: string;
  strategy: AssignmentStrategy;
}

/**
 * Conversation context for assignment.
 */
export interface ConversationContext {
  conversationId: string;
  requiredSkills?: string[];
  tenantId: string;
}

/**
 * Auto-assignment engine.
 * Tracks a cursor per tenant for round-robin fairness.
 */
export class AutoAssignmentEngine {
  private rosters: Map<string, AgentProfile[]> = new Map();
  private cursors: Map<string, number> = new Map();

  /**
   * Register or update an agent in the tenant roster.
   */
  registerAgent(profile: AgentProfile): void {
    const roster = this.rosters.get(profile.tenantId) ?? [];
    const idx = roster.findIndex((a) => a.agentId === profile.agentId);
    if (idx >= 0) {
      roster[idx] = profile;
    } else {
      roster.push(profile);
    }
    this.rosters.set(profile.tenantId, roster);
  }

  /**
   * Remove an agent from the roster.
   */
  unregisterAgent(tenantId: string, agentId: string): void {
    const roster = this.rosters.get(tenantId) ?? [];
    this.rosters.set(
      tenantId,
      roster.filter((a) => a.agentId !== agentId)
    );
  }

  /**
   * Get the active roster for a tenant.
   */
  getRoster(tenantId: string): AgentProfile[] {
    return (this.rosters.get(tenantId) ?? []).filter((a) => a.active);
  }

  /**
   * Assign a conversation using round-robin.
   */
  assignRoundRobin(context: ConversationContext): AssignmentResult {
    const roster = this.getRoster(context.tenantId);
    if (roster.length === 0) {
      return { agentId: null, reason: 'No active agents available', strategy: 'round-robin' };
    }

    const cursor = this.cursors.get(context.tenantId) ?? 0;
    const nextIndex = cursor % roster.length;
    const agent = roster[nextIndex];
    if (!agent) {
      return { agentId: null, reason: 'No active agents available', strategy: 'round-robin' };
    }

    this.cursors.set(context.tenantId, (nextIndex + 1) % roster.length);

    return {
      agentId: agent.agentId,
      reason: `Round-robin assignment (cursor ${nextIndex})`,
      strategy: 'round-robin',
    };
  }

  /**
   * Assign a conversation using skill-based matching.
   * Finds agents with all required skills, then round-robins among them.
   */
  assignSkillBased(context: ConversationContext): AssignmentResult {
    const roster = this.getRoster(context.tenantId);
    if (roster.length === 0) {
      return { agentId: null, reason: 'No active agents available', strategy: 'skill-based' };
    }

    const requiredSkills = context.requiredSkills ?? [];
    if (requiredSkills.length === 0) {
      // No skill requirements — fall back to round-robin
      return this.assignRoundRobin(context);
    }

    const skilled = roster.filter((agent) =>
      requiredSkills.every((skill) => agent.skills.includes(skill))
    );

    if (skilled.length === 0) {
      return {
        agentId: null,
        reason: `No agents with required skills: ${requiredSkills.join(', ')}`,
        strategy: 'skill-based',
      };
    }

    // Round-robin among skilled agents
    const skillKey = `${context.tenantId}:skill:${requiredSkills.sort().join(',')}`;
    const cursor = this.cursors.get(skillKey) ?? 0;
    const nextIndex = cursor % skilled.length;
    const agent = skilled[nextIndex];
    if (!agent) {
      return {
        agentId: null,
        reason: `No agents with required skills: ${requiredSkills.join(', ')}`,
        strategy: 'skill-based',
      };
    }

    this.cursors.set(skillKey, (nextIndex + 1) % skilled.length);

    return {
      agentId: agent.agentId,
      reason: `Skill-based assignment (matched ${requiredSkills.length} skills, cursor ${nextIndex})`,
      strategy: 'skill-based',
    };
  }

  /**
   * Assign using the specified strategy.
   */
  assign(context: ConversationContext, strategy: AssignmentStrategy = 'round-robin'): AssignmentResult {
    if (strategy === 'skill-based') {
      return this.assignSkillBased(context);
    }
    return this.assignRoundRobin(context);
  }

  /**
   * Reset the cursor for a tenant (for testing).
   */
  resetCursor(tenantId: string): void {
    this.cursors.delete(tenantId);
  }

  /**
   * Clear all state (for testing).
   */
  reset(): void {
    this.rosters.clear();
    this.cursors.clear();
  }
}

/**
 * Default singleton instance.
 */
let defaultEngine: AutoAssignmentEngine | null = null;

/**
 * Get or create the default auto-assignment engine.
 */
export function getAutoAssignmentEngine(): AutoAssignmentEngine {
  if (!defaultEngine) {
    defaultEngine = new AutoAssignmentEngine();
  }
  return defaultEngine;
}

/**
 * Reset the default engine (for testing).
 */
export function resetAutoAssignmentEngine(): void {
  defaultEngine = null;
}

/**
 * Create a new auto-assignment engine instance.
 */
export function createAutoAssignmentEngine(): AutoAssignmentEngine {
  return new AutoAssignmentEngine();
}
