import type { DeviceType, MqttAccountDto, MqttCredentialsDto } from "@cimcms/contracts";
import { useGetMqttAccountQuery, useResetMqttPasswordMutation } from "@api/deviceApi";
import { Card, InfoRow } from "@features/devices/components/DeviceInfoCards";
import { NextSteps } from "@features/devices/components/DeviceFormModal";
import { MqttCredentialsPanel } from "@features/devices/components/MqttCredentialsPanel";
import { ConfirmDialog } from "@features/ledControl/components/ConfirmDialog";
import { Modal } from "@shared/components/ui/Modal";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { formatIst } from "@shared/utils/time";
import { useState } from "react";

const primaryClass =
  "rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-40 cursor-pointer";

const accountText = (a: MqttAccountDto): string => {
  if (a.exists) return "Exists";
  return a.provisioning === "manual" ? "Managed on the external broker" : "Missing";
};

interface BrokerAccountCardProps {
  device: { id: string; deviceId: string; type: DeviceType };
}

/**
 * Broker (MQTT) account of a device, for DEVICE_MANAGE only: render it only for those
 * users so the request is not made otherwise. In `broker` mode the password can be reset
 * (or the account created); the new password is shown once.
 */
export const BrokerAccountCard = ({ device }: BrokerAccountCardProps) => {
  const { data: account, isLoading, isError, refetch } = useGetMqttAccountQuery(device.id);
  const [resetPassword, { isLoading: resetting, reset: clearResult }] = useResetMqttPasswordMutation();
  const [confirming, setConfirming] = useState(false);
  const [credentials, setCredentials] = useState<MqttCredentialsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const creating = account ? !account.exists : false;
  const actionLabel = creating ? "Create account" : "Reset password";

  const runReset = () => {
    setConfirming(false);
    setError(null);
    resetPassword(device.id)
      .unwrap()
      .then(setCredentials)
      .catch((e: unknown) => setError(extractErrorMessage(e, "Could not change the broker account")));
  };

  const closeCredentials = () => {
    setCredentials(null);
    clearResult(); // drop the password from the store
  };

  return (
    <Card title="Broker account">
      {isLoading && (
        <p className="text-sm text-text-secondary" role="status">
          Loading broker account…
        </p>
      )}

      {isError && (
        <p className="text-sm text-rose-700" role="alert">
          Could not load the broker account.{" "}
          <button type="button" className="underline cursor-pointer" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}

      {account && (
        <>
          <div data-testid="broker-account">
            <InfoRow
              label="Mode"
              value={account.provisioning === "broker" ? "Automatic (CIMCMS broker)" : "Manual (external broker)"}
            />
            <InfoRow label="Account" value={accountText(account)} />
            <InfoRow label="Username" value={<span className="font-mono">{account.username}</span>} />
            <InfoRow label="Client ID" value={<span className="font-mono">{account.clientId}</span>} />
            <InfoRow
              label="Broker address"
              value={
                account.brokerUrl ? (
                  <span className="font-mono">{account.brokerUrl}</span>
                ) : (
                  "Not configured — ask the server admin"
                )
              }
            />
            <InfoRow label="Created" value={formatIst(account.createdAt)} />
            <InfoRow label="Password set" value={formatIst(account.passwordSetAt)} />
            <InfoRow label="Topic base" value={<span className="font-mono break-all">{account.topics.base}/…</span>} />
          </div>

          {error && (
            <p className="mt-3 rounded-btn bg-rose-50 text-rose-700 px-3 py-2 text-sm" role="alert">
              {error}
            </p>
          )}

          {account.provisioning === "broker" ? (
            <div className="mt-4">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setConfirming(true)}
                className={primaryClass}
              >
                {actionLabel}
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <NextSteps deviceId={device.deviceId} deviceType={device.type} intro={false} />
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={confirming}
        title={creating ? `Create broker account for ${device.deviceId}?` : `Reset broker password of ${device.deviceId}?`}
        cancelLabel="Cancel"
        confirmLabel={actionLabel}
        onCancel={() => setConfirming(false)}
        onConfirm={runReset}
      >
        <div className="space-y-2 text-sm text-text-secondary">
          <p>A new password is generated and shown only once.</p>
          <p>The device is disconnected until it uses the new password.</p>
        </div>
      </ConfirmDialog>

      {credentials && (
        <Modal
          isOpen
          onClose={closeCredentials}
          title={`Broker login for ${device.deviceId}`}
          footer={
            <button type="button" onClick={closeCredentials} className={primaryClass}>
              Done
            </button>
          }
        >
          <div className="max-h-[70vh] overflow-y-auto">
            <MqttCredentialsPanel credentials={credentials} />
          </div>
        </Modal>
      )}
    </Card>
  );
};
