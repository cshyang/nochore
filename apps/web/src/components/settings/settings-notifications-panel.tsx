import { SectionHeading, SettingsCard, SettingsRow, Toggle } from "~/components/SettingsComponents";
import type { NotificationConfigView } from "~/lib/types";

export interface SettingsNotificationsPanelProps {
  notificationConfig: NotificationConfigView;
  onSetNotificationConfig: (notificationConfig: NotificationConfigView) => void;
  onCommitNotifications: (notificationConfig: NotificationConfigView) => void;
}

export function SettingsNotificationsPanel({
  notificationConfig,
  onSetNotificationConfig,
  onCommitNotifications,
}: SettingsNotificationsPanelProps) {
  const updateNotifications = (patch: Partial<NotificationConfigView>) => {
    const next = { ...notificationConfig, ...patch };
    onSetNotificationConfig(next);
    onCommitNotifications(next);
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeading>Notifications</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="◎"
          title="In-app"
          description="Show events in Nochore."
          trailing={
            <Toggle
              checked={notificationConfig.inApp !== false}
              onChange={(checked) => updateNotifications({ inApp: checked })}
            />
          }
        />
        <SettingsRow
          icon="✉"
          title="Email"
          description="Send email summaries."
          trailing={
            <Toggle
              checked={notificationConfig.email === true}
              onChange={(checked) => updateNotifications({ email: checked })}
            />
          }
        />
        <SettingsRow
          icon="▣"
          title="Slack"
          description="Notify a Slack channel."
          isLast
          trailing={
            <Toggle
              checked={notificationConfig.slack === true}
              onChange={(checked) => updateNotifications({ slack: checked })}
            />
          }
        />
      </SettingsCard>
    </div>
  );
}
