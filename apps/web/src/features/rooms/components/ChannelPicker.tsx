import { LED_CHANNEL_COUNT, type RoomChannelViewDto } from "@cimcms/contracts";

export interface PickedChannel {
  deviceId: string;
  relay: number;
  label: string;
}

interface ChannelPickerProps {
  /** Devices that have relay channels. */
  deviceIds: string[];
  /** Every assignment of every room (shows which relays are taken). */
  assignments: RoomChannelViewDto[];
  roomId: string;
  selected: PickedChannel[];
  disabled: boolean;
  onChange: (next: PickedChannel[]) => void;
}

/** 16 toggles per device. A relay owned by another room is disabled and names that room. */
export const ChannelPicker = ({
  deviceIds,
  assignments,
  roomId,
  selected,
  disabled,
  onChange,
}: ChannelPickerProps) => {
  const taken = new Map<string, RoomChannelViewDto>();
  for (const a of assignments) {
    if (a.roomId !== roomId) taken.set(`${a.deviceId}#${a.relay}`, a);
  }
  const find = (deviceId: string, relay: number) =>
    selected.find((s) => s.deviceId === deviceId && s.relay === relay);

  const toggle = (deviceId: string, relay: number) => {
    if (find(deviceId, relay)) {
      onChange(selected.filter((s) => !(s.deviceId === deviceId && s.relay === relay)));
    } else {
      onChange([...selected, { deviceId, relay, label: "" }]);
    }
  };
  const setLabel = (deviceId: string, relay: number, label: string) =>
    onChange(
      selected.map((s) => (s.deviceId === deviceId && s.relay === relay ? { ...s, label } : s)),
    );

  return (
    <div className="space-y-4">
      {deviceIds.length === 0 && (
        <p className="text-sm text-text-secondary">No devices with relay channels.</p>
      )}
      {deviceIds.map((deviceId) => (
        <fieldset key={deviceId} className="rounded-card border border-border p-3">
          <legend className="px-1 text-sm font-semibold text-text-primary">{deviceId}</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: LED_CHANNEL_COUNT }, (_, i) => i + 1).map((relay) => {
              const other = taken.get(`${deviceId}#${relay}`);
              const picked = find(deviceId, relay);
              return (
                <div
                  key={relay}
                  className="rounded-btn border border-border p-2 text-xs space-y-1"
                  data-testid={`channel-${deviceId}-${relay}`}
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Relay ${relay} of ${deviceId}`}
                      checked={!!picked}
                      disabled={disabled || !!other}
                      onChange={() => toggle(deviceId, relay)}
                    />
                    <span className="font-medium text-text-primary">Relay {relay}</span>
                  </label>
                  {other && (
                    <p className="text-amber-700" data-testid={`taken-${deviceId}-${relay}`}>
                      Taken by {other.roomName}
                    </p>
                  )}
                  {picked && (
                    <input
                      aria-label={`Label for relay ${relay} of ${deviceId}`}
                      value={picked.label}
                      disabled={disabled}
                      maxLength={60}
                      placeholder="Label"
                      onChange={(e) => setLabel(deviceId, relay, e.target.value)}
                      className="w-full rounded-btn border border-border px-2 py-1"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
};
