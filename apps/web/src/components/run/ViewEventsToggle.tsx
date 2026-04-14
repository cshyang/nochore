import { ListBullets, TextAlignLeft } from "@phosphor-icons/react";
import { Button } from "~/components/Button";

export function ViewEventsToggle({
  showEvents,
  onToggle,
  hasFinding = false,
}: {
  showEvents: boolean;
  onToggle: () => void;
  hasFinding?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Button variant="ghost" size="sm" onClick={onToggle}>
        {showEvents ? (
          <>
            <TextAlignLeft size={13} weight="bold" />
            {hasFinding ? "View finding" : "Hide events"}
          </>
        ) : (
          <>
            <ListBullets size={13} weight="bold" />
            View events
          </>
        )}
      </Button>
    </div>
  );
}
