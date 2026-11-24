import {
  DEVICE_TYPES,
  REGISTRABLE_DEVICE_TYPES,
  registerDeviceBodySchema,
  updateDeviceBodySchema,
  type DeviceType,
  type RegisterDeviceBody,
  type RegisterDeviceResultDto,
  type UpdateDeviceBody,
} from "@cimcms/contracts";
import { useResetMqttPasswordMutation } from "@api/deviceApi";
import { MqttCredentialsPanel } from "@features/devices/components/MqttCredentialsPanel";
import { DEVICE_TYPE_LABEL } from "@features/devices/utils/deviceTypeInfo";
import { Modal } from "@shared/components/ui/Modal";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { useState } from "react";

const inputClass = "w-full rounded-btn border border-border px-3 py-2";
const cancelClass =
  "rounded-btn border border-border px-4 py-2 text-sm font-medium text-text-primary cursor-pointer";
const primaryClass =
  "rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-40 cursor-pointer";

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) => (
  <label className="block">
    <span className="block font-medium text-text-primary mb-1">{label}</span>
    {children}
    {hint}
  </label>
);

const ErrorBox = ({ error }: { error: string | null }) =>
  error ? (
    <p className="rounded-btn bg-rose-50 text-rose-700 px-3 py-2" role="alert">
      {error}
    </p>
  ) : null;

/** Optional text: empty input means "not set". */
const opt = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);

// ── Add ─────────────────────────────────────────────────────────

interface AddDeviceModalProps {
  isOpen: boolean;
  error: string | null;
  busy: boolean;
  /** Set after a successful save: the dialog then shows the broker login (or the manual steps). */
  registered: RegisterDeviceResultDto | null;
  onClose: () => void;
  onSubmit: (body: RegisterDeviceBody) => void;
}

/** Register a controller. The device id is also its broker username and cannot be changed later. */
export const AddDeviceModal = ({ isOpen, error, busy, registered, onClose, onSubmit }: AddDeviceModalProps) => {
  const [deviceId, setDeviceId] = useState("");
  const [deviceType, setDeviceType] = useState<DeviceType>("LED_CONTROLLER");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const body = { deviceId: deviceId.trim(), deviceType, name: opt(name), location: opt(location) };
  const parsed = registerDeviceBodySchema.safeParse(body);
  const idOk = registerDeviceBodySchema.shape.deviceId.safeParse(deviceId.trim()).success;

  const close = () => {
    setDeviceId("");
    setName("");
    setLocation("");
    setDeviceType("LED_CONTROLLER");
    onClose();
  };

  if (registered) {
    return <DeviceAddedModal isOpen={isOpen} result={registered} onClose={close} />;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Add device"
      footer={
        <>
          <button type="button" onClick={close} className={cancelClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsed.success || busy}
            onClick={() => parsed.success && onSubmit(parsed.data)}
            className={primaryClass}
          >
            Add device
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Field
          label="Device ID"
          hint={
            deviceId && !idOk ? (
              <span className="text-xs text-rose-700">3–40 characters: letters, digits and dash only.</span>
            ) : (
              <span className="text-xs text-text-secondary">
                For example LED-02. Also the broker username; it cannot be changed later.
              </span>
            )
          }
        >
          <input
            aria-label="Device ID"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            maxLength={40}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Type">
          <select
            aria-label="Type"
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value as DeviceType)}
            className={inputClass}
          >
            {(Object.keys(DEVICE_TYPES) as DeviceType[]).map((t) => (
              <option key={t} value={t} disabled={!REGISTRABLE_DEVICE_TYPES.includes(t)}>
                {DEVICE_TYPE_LABEL[t]}
                {REGISTRABLE_DEVICE_TYPES.includes(t) ? "" : " (planned)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Optional, e.g. Room A lights"
            className={inputClass}
          />
        </Field>
        <Field label="Location">
          <input
            aria-label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            placeholder="Optional"
            className={inputClass}
          />
        </Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
};

/**
 * Success view of the Add dialog. `broker`: the broker login, shown once. `manual`: the steps
 * for the external broker's admin. Failed account creation: the error and a retry (a password reset
 * creates the missing account).
 */
const DeviceAddedModal = ({
  isOpen,
  result,
  onClose,
}: {
  isOpen: boolean;
  result: RegisterDeviceResultDto;
  onClose: () => void;
}) => {
  const [resetPassword, retry] = useResetMqttPasswordMutation();
  const { device } = result;
  const credentials = result.credentials ?? retry.data ?? null;

  const close = () => {
    retry.reset(); // drop the password from the store
    onClose();
  };

  let content: React.ReactNode;
  if (credentials) {
    content = (
      <>
        <p className="text-sm text-text-primary mb-3">
          <span className="font-mono font-semibold">{device.deviceId}</span> is registered and its broker account
          is ready. It shows as <strong>Offline</strong> until the controller connects.
        </p>
        <MqttCredentialsPanel credentials={credentials} />
      </>
    );
  } else if (result.provisioning === "manual") {
    content = <NextSteps deviceId={device.deviceId} deviceType={device.type} />;
  } else {
    const message = retry.error
      ? extractErrorMessage(retry.error, "The broker account could not be created.")
      : (result.provisioningError ?? "The broker account could not be created.");
    content = (
      <div className="space-y-3 text-sm">
        <p className="text-text-primary">
          <span className="font-mono font-semibold">{device.deviceId}</span> is registered, but its broker account
          could not be created.
        </p>
        <ErrorBox error={message} />
        <button
          type="button"
          disabled={retry.isLoading}
          onClick={() => void resetPassword(device.id)}
          className={primaryClass}
        >
          {retry.isLoading ? "Trying…" : "Try again"}
        </button>
        <p className="text-text-secondary">You can also create the account later on the device page.</p>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Device added"
      footer={
        <button type="button" onClick={close} className={primaryClass}>
          Done
        </button>
      }
    >
      <div className="max-h-[70vh] overflow-y-auto">{content}</div>
    </Modal>
  );
};

/** What the external broker's admin and the firmware need when broker accounts are created by hand. */
export const NextSteps = ({
  deviceId,
  deviceType,
  intro = true,
}: {
  deviceId: string;
  deviceType: DeviceType;
  /** The "is registered … Offline" sentence (off where the device status is already shown). */
  intro?: boolean;
}) => {
  const base = `cimcms/${DEVICE_TYPES[deviceType].topicSegment}/${deviceId}`;
  return (
    <div className="space-y-3 text-sm text-text-primary">
      {intro && (
        <p>
          <span className="font-mono font-semibold">{deviceId}</span> is registered. It shows as{" "}
          <strong>Offline</strong> until the controller connects.
        </p>
      )}
      <div>
        <p className="font-medium">1. Broker account (external broker admin)</p>
        <p className="text-text-secondary">
          The account must be created on the external broker by its admin: a user named{" "}
          <span className="font-mono">{deviceId}</span> with its own password, allowed only{" "}
          <span className="font-mono">{base}/…</span>. Never share the password in chat or Git.
        </p>
      </div>
      <div>
        <p className="font-medium">2. Firmware settings</p>
        <ul className="list-disc pl-5 text-text-secondary space-y-0.5">
          <li>
            Client ID and username: <span className="font-mono">{deviceId}</span>
          </li>
          <li>
            Publishes: <span className="font-mono">{base}/status</span>, <span className="font-mono">telemetry</span>,{" "}
            <span className="font-mono">ack</span>, <span className="font-mono">event</span>
          </li>
          <li>
            Subscribes: <span className="font-mono">{base}/command</span>, <span className="font-mono">config</span>
          </li>
          <li>Keep relay simulation ON until the wiring and safety checks are done.</li>
        </ul>
      </div>
    </div>
  );
};

// ── Edit ────────────────────────────────────────────────────────

interface EditDeviceModalProps {
  isOpen: boolean;
  error: string | null;
  busy: boolean;
  device: { deviceId: string; type: DeviceType; name: string; location?: string };
  onClose: () => void;
  onSubmit: (body: UpdateDeviceBody) => void;
}

/** Change name and location. Device ID and type are fixed. */
export const EditDeviceModal = ({ isOpen, error, busy, device, onClose, onSubmit }: EditDeviceModalProps) => {
  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location ?? "");
  const body = { name: opt(name), location: location.trim() };
  const parsed = updateDeviceBodySchema.safeParse(body);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${device.deviceId}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsed.success || !body.name || busy}
            onClick={() => parsed.success && onSubmit(parsed.data)}
            className={primaryClass}
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-secondary">
          {DEVICE_TYPE_LABEL[device.type]} · <span className="font-mono">{device.deviceId}</span>
        </p>
        <Field label="Name">
          <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />
        </Field>
        <Field label="Location">
          <input
            aria-label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
};
