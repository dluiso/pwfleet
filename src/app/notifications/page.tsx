import { Bell, CircleAlert, ExternalLink } from "lucide-react";
import Link from "next/link";
import { MarkAllNotificationsRead, NotificationAction } from "@/components/notification-actions";
import { formatDateTime, formatEnum } from "@/lib/format";
import { listUserNotifications } from "@/modules/notifications/repository";

export default async function NotificationsPage() {
  const notifications = await listUserNotifications();
  const unread = notifications.filter((item) => !item.readAt).length;
  return <div className="page-stack">
    <section className="page-heading-row"><div><span className="eyebrow">OPERATIONAL ALERTS</span><h1>Notifications</h1><p>Safety decisions, assignments, escalations, and delivery events requiring your attention.</p></div>{unread ? <MarkAllNotificationsRead /> : null}</section>
    <section className="panel records-panel"><div className="panel-header"><div><span className="eyebrow">INBOX</span><h2>Your operational notifications</h2></div><span className="record-count">{unread} unread</span></div>
      {notifications.length ? <div className="notification-list">{notifications.map((item) => <article className={`${item.readAt ? "notification-item" : "notification-item notification-item-unread"} ${item.urgency === "critical" ? "notification-item-critical" : ""}`} key={item.id}>
        <span className={item.urgency === "critical" ? "record-icon record-icon-danger" : "record-icon"}>{item.urgency === "critical" ? <CircleAlert size={18} /> : <Bell size={18} />}</span>
        <div><div className="notification-item-title"><strong>{item.title}</strong><span>{formatEnum(item.kind)} · {formatDateTime(item.createdAt)}</span></div><p>{item.body}</p>{item.href ? <Link className="text-link" href={item.href}>Open record <ExternalLink size={13} /></Link> : null}</div>
        <NotificationAction acknowledged={Boolean(item.acknowledgedAt)} id={item.id} read={Boolean(item.readAt)} requiresAcknowledgment={item.requiresAcknowledgment} />
      </article>)}</div> : <div className="empty-state"><Bell size={28} /><strong>No notifications</strong><p>Operational alerts addressed to you will appear here.</p></div>}
    </section>
  </div>;
}
