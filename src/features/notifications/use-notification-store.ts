import { create } from "zustand";
import type { AppNotification } from "../../components/NotificationViewport";

interface NotificationState {
  notifications: AppNotification[];
  push: (notification: AppNotification, durationMs?: number | null) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  push: (notification, durationMs = null) => {
    clearTimer(notification.id);
    const previous = get().notifications;
    const notifications = [
      notification,
      ...previous.filter((current) => current.id !== notification.id),
    ].slice(0, 3);
    const retainedIds = new Set(notifications.map(({ id }) => id));
    previous.filter(({ id }) => !retainedIds.has(id)).forEach(({ id }) => clearTimer(id));
    set({ notifications });

    if (durationMs !== null) {
      timers.set(
        notification.id,
        setTimeout(() => get().dismiss(notification.id), durationMs),
      );
    }
  },

  dismiss: (id) => {
    clearTimer(id);
    set((state) => ({
      notifications: state.notifications.filter((notification) => notification.id !== id),
    }));
  },

  clear: () => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    set({ notifications: [] });
  },
}));
