import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';

export interface Notification {
  id: string;
  siteId: string;
  event: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  description: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  INFO: 'bg-blue-50 text-blue-700',
  WARNING: 'bg-amber-50 text-amber-700',
  ERROR: 'bg-red-50 text-red-700',
  CRITICAL: 'bg-red-100 text-red-800',
};

export function NotificationsPanel({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  const notificationsQuery = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => api.get<Notification[]>(`/notifications${filter === 'unread' ? '?unreadOnly=true' : ''}`),
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bell className="size-4" />
          Notifications
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadCount}</span>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}>
            {filter === 'unread' ? 'Show all' : 'Unread only'}
          </Button>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAllReadMutation.mutate()}>
              <CheckCheck className="size-3" /> Mark all read
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
              <X className="size-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="max-h-96 space-y-1 overflow-auto p-0">
        {notifications.length === 0 ? (
          <EmptyState message="No notifications." />
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => { if (!notification.read) markReadMutation.mutate(notification.id); }}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/40',
                !notification.read && 'bg-muted/20'
              )}
            >
              <div className={cn('mt-0.5 inline-flex rounded p-1', SEVERITY_STYLE[notification.severity])}>
                <Bell className="size-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{notification.title}</span>
                  {!notification.read && <span className="size-1.5 rounded-full bg-blue-500" />}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{notification.description}</p>
                <span className="text-[10px] text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</span>
              </div>
              {!notification.read && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(notification.id); }}
                >
                  <Check className="size-3" />
                </Button>
              )}
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Inline notification bell with badge — use in header */
export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get<Notification[]>('/notifications?unreadOnly=true'),
    refetchInterval: 30_000,
  });

  const unreadCount = (notificationsQuery.data ?? []).length;

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(!open)}>
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-full z-50 mt-2">
            <NotificationsPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
