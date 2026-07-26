import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface AgentProfile {
  id: string;
  tenantId: string;
  name: string;
  useCase: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  tone: string | null;
  language: string;
  businessRules: Record<string, unknown>; // free-form JSONB (schema-less)
  handoverPolicy: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSession {
  id: string;
  tenantId: string;
  agentProfileId: string;
  conversationId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'HANDOVER';
  startedAt: string;
  endedAt: string | null;
  messagesCount: number;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ToolPolicy {
  id: string;
  tenantId: string;
  name?: string;
  agentProfileId?: string | null;
  toolName?: string;
  allowed: boolean;
  constraints: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export abstract class AIAgentRepository {
  abstract listProfiles(tenantId: string): Promise<AgentProfile[]>;
  abstract getProfile(tenantId: string, id: string): Promise<AgentProfile | null>;
  abstract createProfile(tenantId: string, profile: Omit<AgentProfile, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<AgentProfile>;
  abstract updateProfile(tenantId: string, id: string, update: Partial<AgentProfile>): Promise<AgentProfile>;
  abstract deleteProfile(tenantId: string, id: string): Promise<void>;

  abstract listSessions(tenantId: string, agentProfileId?: string): Promise<AgentSession[]>;
  abstract getSession(tenantId: string, id: string): Promise<AgentSession | null>;
  abstract createSession(tenantId: string, session: Omit<AgentSession, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'startedAt' | 'endedAt' | 'messagesCount'>): Promise<AgentSession>;
  abstract updateSession(tenantId: string, id: string, update: Partial<AgentSession>): Promise<AgentSession>;

  abstract listToolPolicies(tenantId: string, agentProfileId?: string): Promise<ToolPolicy[]>;
  abstract createToolPolicy(tenantId: string, policy: Omit<ToolPolicy, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<ToolPolicy>;
  abstract updateToolPolicy(tenantId: string, id: string, update: Partial<ToolPolicy>): Promise<ToolPolicy>;
  abstract deleteToolPolicy(tenantId: string, id: string): Promise<void>;
}

@Injectable()
export class InMemoryAIAgentRepository extends AIAgentRepository {
  private profiles = new Map<string, AgentProfile>();
  private sessions = new Map<string, AgentSession>();
  private toolPolicies = new Map<string, ToolPolicy>();

  async listProfiles(tenantId: string): Promise<AgentProfile[]> {
    return Array.from(this.profiles.values()).filter(p => p.tenantId === tenantId);
  }

  async getProfile(tenantId: string, id: string): Promise<AgentProfile | null> {
    const p = this.profiles.get(id);
    return p && p.tenantId === tenantId ? p : null;
  }

  async createProfile(tenantId: string, profile: Omit<AgentProfile, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<AgentProfile> {
    const now = new Date().toISOString();
    const created = { ...profile, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.profiles.set(created.id, created);
    return created;
  }

  async updateProfile(tenantId: string, id: string, update: Partial<AgentProfile>): Promise<AgentProfile> {
    const existing = this.profiles.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Profile not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.profiles.set(id, updated);
    return updated;
  }

  async deleteProfile(tenantId: string, id: string): Promise<void> {
    const existing = this.profiles.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Profile not found');
    this.profiles.delete(id);
  }

  async listSessions(tenantId: string, agentProfileId?: string): Promise<AgentSession[]> {
    return Array.from(this.sessions.values()).filter(
      s => s.tenantId === tenantId && (!agentProfileId || s.agentProfileId === agentProfileId)
    );
  }

  async getSession(tenantId: string, id: string): Promise<AgentSession | null> {
    const s = this.sessions.get(id);
    return s && s.tenantId === tenantId ? s : null;
  }

  async createSession(tenantId: string, session: Omit<AgentSession, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'startedAt' | 'endedAt' | 'messagesCount'>): Promise<AgentSession> {
    const now = new Date().toISOString();
    const created = { ...session, tenantId, id: randomUUID(), startedAt: now, endedAt: null, messagesCount: 0, createdAt: now, updatedAt: now };
    this.sessions.set(created.id, created);
    return created;
  }

  async updateSession(tenantId: string, id: string, update: Partial<AgentSession>): Promise<AgentSession> {
    const existing = this.sessions.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Session not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.sessions.set(id, updated);
    return updated;
  }

  async listToolPolicies(tenantId: string, agentProfileId?: string): Promise<ToolPolicy[]> {
    return Array.from(this.toolPolicies.values()).filter(
      t => t.tenantId === tenantId && (!agentProfileId || t.agentProfileId === agentProfileId)
    );
  }

  async createToolPolicy(tenantId: string, policy: Omit<ToolPolicy, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<ToolPolicy> {
    const now = new Date().toISOString();
    const created = { agentProfileId: null, toolName: policy.name ?? '', ...policy, tenantId, id: randomUUID(), createdAt: now, updatedAt: now };
    this.toolPolicies.set(created.id, created);
    return created;
  }

  async updateToolPolicy(tenantId: string, id: string, update: Partial<ToolPolicy>): Promise<ToolPolicy> {
    const existing = this.toolPolicies.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Tool policy not found');
    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    this.toolPolicies.set(id, updated);
    return updated;
  }

  async deleteToolPolicy(tenantId: string, id: string): Promise<void> {
    const existing = this.toolPolicies.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error('Tool policy not found');
    this.toolPolicies.delete(id);
  }
}
