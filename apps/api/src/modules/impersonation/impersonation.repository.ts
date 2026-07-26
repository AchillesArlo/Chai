import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface ImpersonationSession {
  id: string;
  tenantId: string;
  impersonatorId: string;
  impersonatedUserId: string;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'ended' | 'expired' | 'revoked';
  ipAddress: string | null;
  userAgent: string | null;
  maxDurationMinutes: number;
  requiresApproval: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface ImpersonationAuditLog {
  id: string;
  impersonationSessionId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>; // free-form JSONB (schema-less)
  createdAt: string;
}

export abstract class ImpersonationRepository {
  abstract listSessions(tenantId: string, status?: string): Promise<ImpersonationSession[]>;
  abstract getSession(tenantId: string, id: string): Promise<ImpersonationSession | null>;
  abstract createSession(session: Omit<ImpersonationSession, 'id' | 'createdAt' | 'endedAt'>): Promise<ImpersonationSession>;
  abstract updateSession(id: string, update: Partial<ImpersonationSession>): Promise<ImpersonationSession>;
  abstract listAuditLogs(sessionId: string): Promise<ImpersonationAuditLog[]>;
  abstract createAuditLog(log: Omit<ImpersonationAuditLog, 'id' | 'createdAt'>): Promise<ImpersonationAuditLog>;
}

@Injectable()
export class InMemoryImpersonationRepository extends ImpersonationRepository {
  private sessions = new Map<string, ImpersonationSession>();
  private auditLogs: ImpersonationAuditLog[] = [];

  async listSessions(tenantId: string, status?: string): Promise<ImpersonationSession[]> {
    return Array.from(this.sessions.values()).filter(
      s => s.tenantId === tenantId && (!status || s.status === status)
    );
  }

  async getSession(tenantId: string, id: string): Promise<ImpersonationSession | null> {
    const s = this.sessions.get(id);
    return s && s.tenantId === tenantId ? s : null;
  }

  async createSession(session: Omit<ImpersonationSession, 'id' | 'createdAt' | 'endedAt'>): Promise<ImpersonationSession> {
    const created = { ...session, id: randomUUID(), createdAt: new Date().toISOString(), endedAt: null };
    this.sessions.set(created.id, created);
    return created;
  }

  async updateSession(id: string, update: Partial<ImpersonationSession>): Promise<ImpersonationSession> {
    const existing = this.sessions.get(id);
    if (!existing) throw new Error('Impersonation session not found');
    const updated = { ...existing, ...update };
    this.sessions.set(id, updated);
    return updated;
  }

  async listAuditLogs(sessionId: string): Promise<ImpersonationAuditLog[]> {
    return this.auditLogs.filter(l => l.impersonationSessionId === sessionId);
  }

  async createAuditLog(log: Omit<ImpersonationAuditLog, 'id' | 'createdAt'>): Promise<ImpersonationAuditLog> {
    const created = { ...log, id: randomUUID(), createdAt: new Date().toISOString() };
    this.auditLogs.push(created);
    return created;
  }
}
