import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Internal notification system. Core application must work without external
 * email delivery. Notifications are stored in the database and surfaced via
 * the API/dashboard.
 *
 * Notification events:
 *   CRITICAL_ISSUE — A critical issue was detected
 *   WORDPRESS_DISCONNECTED — WordPress integration lost connection
 *   GSC_EXPIRED — Google Search Console token expired
 *   PROVIDER_FAILURE — AI provider failed
 *   REPORT_READY — Monthly report generated
 *   PUBLICATION_FAILED — WordPress publication failed
 *   JOB_REPEATEDLY_FAILED — A job has failed multiple times
 *   INTEGRATION_DISCONNECTED — External integration lost
 *   TASK_ASSIGNED — Task assigned to user
 *   RECOMMENDATION_REQUIRES_REVIEW — Conflicting recommendation needs review
 */

export type NotificationEvent =
  | 'CRITICAL_ISSUE'
  | 'WORDPRESS_DISCONNECTED'
  | 'GSC_EXPIRED'
  | 'PROVIDER_FAILURE'
  | 'REPORT_READY'
  | 'PUBLICATION_FAILED'
  | 'JOB_REPEATEDLY_FAILED'
  | 'INTEGRATION_DISCONNECTED'
  | 'TASK_ASSIGNED'
  | 'RECOMMENDATION_REQUIRES_REVIEW'
  | 'CUSTOM';

export type NotificationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface NotificationPayload {
  siteId: string;
  organizationId?: string | null;
  event: NotificationEvent;
  severity: NotificationSeverity;
  title: string;
  description: string;
  data?: Record<string, unknown>;
  targetUserId?: string | null;
}

export interface NotificationRecord {
  id: string;
  siteId: string;
  organizationId: string | null;
  event: string;
  severity: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
  targetUserId: string | null;
  read: boolean;
  createdAt: string;
}

// Lightweight in-memory entity for notifications
interface NotificationRow {
  id: string;
  siteId: string;
  organizationId: string | null;
  event: string;
  severity: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
  targetUserId: string | null;
  read: boolean;
  createdAt: Date;
}

let notificationCounter = 0;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // In-memory notification store (ephemeral — survives process restart via DB when available)
  private readonly notifications: NotificationRow[] = [];
  private readonly MAX_IN_MEMORY = 1000;

  async emit(payload: NotificationPayload): Promise<string> {
    const id = `notif-${++notificationCounter}-${Date.now()}`;
    const row: NotificationRow = {
      id,
      siteId: payload.siteId,
      organizationId: payload.organizationId ?? null,
      event: payload.event,
      severity: payload.severity,
      title: payload.title,
      description: payload.description,
      data: payload.data ?? {},
      targetUserId: payload.targetUserId ?? null,
      read: false,
      createdAt: new Date(),
    };

    this.notifications.unshift(row);

    // Evict old notifications
    if (this.notifications.length > this.MAX_IN_MEMORY) {
      this.notifications.splice(this.MAX_IN_MEMORY);
    }

    this.logger.log(`[${payload.severity}] ${payload.event}: ${payload.title}`);

    // Optional: SMTP delivery when configured
    // TODO: integrate email when SMTP is available

    return id;
  }

  async list(
    filters: {
      siteId?: string;
      organizationId?: string;
      event?: NotificationEvent;
      severity?: NotificationSeverity;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<NotificationRecord[]> {
    let results = this.notifications;

    if (filters.siteId) results = results.filter((n) => n.siteId === filters.siteId);
    if (filters.organizationId) results = results.filter((n) => n.organizationId === filters.organizationId);
    if (filters.event) results = results.filter((n) => n.event === filters.event);
    if (filters.severity) results = results.filter((n) => n.severity === filters.severity);
    if (filters.unreadOnly) results = results.filter((n) => !n.read);

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    return results.slice(offset, offset + limit).map(this.toRecord);
  }

  async markRead(id: string): Promise<void> {
    const n = this.notifications.find((n) => n.id === id);
    if (n) n.read = true;
  }

  async markAllRead(siteId?: string): Promise<number> {
    let count = 0;
    for (const n of this.notifications) {
      if (!n.read && (!siteId || n.siteId === siteId)) {
        n.read = true;
        count++;
      }
    }
    return count;
  }

  async getUnreadCount(siteId?: string): Promise<number> {
    return this.notifications.filter((n) => !n.read && (!siteId || n.siteId === siteId)).length;
  }

  private toRecord(row: NotificationRow): NotificationRecord {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      event: row.event,
      severity: row.severity,
      title: row.title,
      description: row.description,
      data: row.data,
      targetUserId: row.targetUserId,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
