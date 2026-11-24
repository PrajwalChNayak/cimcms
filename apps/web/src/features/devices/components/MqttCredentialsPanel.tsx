import type { MqttCredentialsDto } from "@cimcms/contracts";
import { useEffect, useState, type ReactNode } from "react";

const smallBtnClass =
  "shrink-0 rounded-btn border border-border px-2 py-1 text-xs font-medium text-text-primary cursor-pointer";

type CopyState = "idle" | "copied" | "failed";

/** Copies `value` and shows "Copied" for a moment. Fails gracefully where the clipboard API is missing (plain HTTP). */
const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () => {
    if (!navigator.clipboard?.writeText) {
      setState("failed");
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => setState("copied"),
      () => setState("failed"),
    );
  };

  return (
    <>
      <button type="button" aria-label={`Copy ${label}`} onClick={copy} className={smallBtnClass}>
        {state === "copied" ? "Copied" : "Copy"}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? `${label} copied` : ""}
      </span>
      {state === "failed" && (
        <span className="text-xs text-rose-700">Copy is not available here; select the text and copy it.</span>
      )}
    </>
  );
};

const Row = ({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) => (
  <div className="py-2 border-b border-border last:border-0">
    <p className="text-xs text-text-secondary">{label}</p>
    <div className="mt-0.5 flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 break-all text-text-primary">{children}</div>
      {actions}
    </div>
  </div>
);

const TopicList = ({ topics }: { topics: string[] }) => (
  <ul className="font-mono text-xs space-y-0.5">
    {topics.map((t) => (
      <li key={t}>{t}</li>
    ))}
  </ul>
);

/**
 * Broker login for a controller, shown ONCE after the account was created or its password
 * reset. The password is masked until the user asks to see it.
 */
export const MqttCredentialsPanel = ({ credentials }: { credentials: MqttCredentialsDto }) => {
  const [showPassword, setShowPassword] = useState(false);
  const { brokerUrl, username, clientId, password, topics } = credentials;

  return (
    <div className="space-y-3 text-sm" data-testid="mqtt-credentials">
      <p className="rounded-btn bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2" role="note">
        Copy the password now. It is shown only once and cannot be recovered; you can reset it later on the
        device page.
      </p>

      <div>
        <Row
          label="Broker address"
          actions={brokerUrl ? <CopyButton value={brokerUrl} label="broker address" /> : undefined}
        >
          {brokerUrl ? (
            <span className="font-mono">{brokerUrl}</span>
          ) : (
            <span className="text-amber-800">Broker address not configured — ask the server admin</span>
          )}
        </Row>
        <Row label="Username" actions={<CopyButton value={username} label="username" />}>
          <span className="font-mono">{username}</span>
        </Row>
        <Row label="Client ID">
          <span className="font-mono">{clientId}</span>
        </Row>
        <Row
          label="Password"
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className={smallBtnClass}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
              <CopyButton value={password} label="password" />
            </>
          }
        >
          <span className="font-mono" data-testid="mqtt-password">
            {showPassword ? password : "•".repeat(16)}
          </span>
        </Row>
        <Row label="Publishes">
          <TopicList topics={topics.publish} />
        </Row>
        <Row label="Subscribes">
          <TopicList topics={topics.subscribe} />
        </Row>
      </div>

      <p className="text-text-secondary">Keep relay simulation ON until the wiring and safety checks are done.</p>
    </div>
  );
};
