import { AlertTriangle, Check, CircleAlert, Info, X } from "lucide-react";

export type AppNotificationKind = "success" | "info" | "warning" | "error";

export interface AppNotification {
  id: string;
  kind: AppNotificationKind;
  title: string;
  message: string;
  detail?: string;
  actions?: Array<{ label: string; onClick: () => void }>;
}

export interface NotificationViewportProps {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}

const icons = {
  success: Check,
  info: Info,
  warning: AlertTriangle,
  error: CircleAlert,
};

export function NotificationViewport({ notifications, onDismiss }: NotificationViewportProps) {
  return (
    <aside className="notification-viewport" aria-label="Notifications">
      {notifications.slice(0, 3).map((notification) => {
        const Icon = icons[notification.kind];
        const urgent = notification.kind === "warning" || notification.kind === "error";

        return (
          <section
            className={`app-notification ${notification.kind}`}
            key={notification.id}
            role={urgent ? "alert" : "status"}
          >
            <span className="app-notification-icon" aria-hidden="true">
              <Icon size={17} />
            </span>
            <div className="app-notification-content">
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
              {notification.detail && <code>{notification.detail}</code>}
              {notification.actions && notification.actions.length > 0 && (
                <div className="app-notification-actions">
                  {notification.actions.map((action) => (
                    <button key={action.label} type="button" onClick={action.onClick}>
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="app-notification-dismiss"
              type="button"
              onClick={() => onDismiss(notification.id)}
              aria-label={`Dismiss ${notification.title}`}
            >
              <X size={15} />
            </button>
          </section>
        );
      })}
    </aside>
  );
}
