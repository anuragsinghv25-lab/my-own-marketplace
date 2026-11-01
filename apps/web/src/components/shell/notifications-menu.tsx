'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Menu, MenuContent, MenuTrigger, cn } from '@orbita/ui';
import { markNotificationsReadAction } from '@/app/(app)/reviews/actions';
import { timeAgo } from '@/lib/format';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationData {
  items: NotificationItem[];
  unread: number;
}

/** The bell: latest notifications, unread count, open one to go there (and mark it read). */
export function NotificationsMenu({ data }: { data?: NotificationData }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, markLocal] = useOptimistic(data ?? { items: [], unread: 0 }, (s, ids: string[] | 'all') => ({
    unread: ids === 'all' ? 0 : Math.max(0, s.unread - s.items.filter((i) => ids.includes(i.id) && !i.readAt).length),
    items: s.items.map((i) => (ids === 'all' || ids.includes(i.id) ? { ...i, readAt: i.readAt ?? new Date().toISOString() } : i)),
  }));
  const open = (n: NotificationItem) =>
    start(async () => {
      markLocal([n.id]);
      if (!n.readAt) await markNotificationsReadAction([n.id]);
      if (n.link) router.push(n.link);
      router.refresh();
    });
  const readAll = () =>
    start(async () => {
      markLocal('all');
      await markNotificationsReadAction();
      router.refresh();
    });
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="relative shrink-0 h-9 w-9 rounded-full grid place-items-center text-mute hover:bg-soft"
          aria-label={state.unread ? `Notifications, ${state.unread} unread` : 'Notifications'}
        >
          <Bell size={18} />
          {state.unread ? (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-bad text-[10px] font-semibold text-white grid place-items-center">
              {state.unread > 9 ? '9+' : state.unread}
            </span>
          ) : null}
        </button>
      </MenuTrigger>
      <MenuContent>
        {state.items.length === 0 ? (
          <div className="w-72 px-3 py-6 text-center">
            <div className="mx-auto mb-3 h-11 w-11 rounded-2xl bg-accent/10 text-accent grid place-items-center">
              <Bell size={18} />
            </div>
            <div className="text-sm font-semibold">You&apos;re all caught up</div>
            <p className="text-xs text-mute mt-1">Review assignments and approvals will appear here.</p>
          </div>
        ) : (
          <div className="w-[min(360px,calc(100vw-2rem))]">
            <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
              <span className="text-sm font-semibold">Notifications</span>
              {state.unread ? (
                <button type="button" onClick={readAll} className="text-xs text-accent hover:underline">
                  Mark all read
                </button>
              ) : null}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {state.items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className="w-full text-left flex gap-2.5 rounded-xl px-3 py-2 hover:bg-soft">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} aria-hidden />
                    <span className="min-w-0">
                      <span className={cn('block text-sm', !n.readAt && 'font-medium')}>{n.title}</span>
                      {n.body ? <span className="block text-xs text-mute line-clamp-2">{n.body}</span> : null}
                      <span className="block text-[11px] text-mute mt-0.5">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </MenuContent>
    </Menu>
  );
}
