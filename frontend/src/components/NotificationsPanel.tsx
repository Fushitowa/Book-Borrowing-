import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { date } from '../utils/format';
import type { Notice } from '../types/app';
import type { NotificationItem } from '../types';
export function NotificationsPanel({ onDismiss, notify }: { onDismiss: () => void; notify: (notice: Notice) => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => { api<{ items: NotificationItem[] }>('/notifications').then((result) => setItems(result.items)).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false)); }, [notify]);
  useEffect(load, [load]);
  const markRead = async (item: NotificationItem) => {
    try { await api(`/notifications/${item.id}/read`, { method: 'POST' }); setItems((current) => current.map((notice) => notice.id === item.id ? { ...notice, readAt: new Date().toISOString() } : notice)); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not mark notification read.' }); }
  };
  return <><button className="popover-dismiss" aria-label="Close notifications" onClick={onDismiss}/><section className="notification-panel"><div className="notification-heading"><span><strong>Notifications</strong><small>Library updates for your account</small></span><button onClick={onDismiss} aria-label="Close">×</button></div>{loading ? <div className="notification-empty">Loading…</div> : items.length ? <div className="notification-list">{items.map((item) => <button className={`notification-item ${item.readAt ? 'read' : ''}`} key={item.id} onClick={() => !item.readAt && markRead(item)}><span className="notification-dot"/><span><strong>{item.title}</strong><small>{item.body}</small><i>{date(item.createdAt)}</i></span></button>)}</div> : <div className="notification-empty">You’re all caught up.</div>}</section></>;
}
