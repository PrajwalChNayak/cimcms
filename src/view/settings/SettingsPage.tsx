import { useSelector } from "react-redux";
import { selectAllFarms } from "@store/slices/farmsSlice";
import { selectAllDevices } from "@store/slices/devicesSlice";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-card bg-surface border border-border shadow-sm">
    <div className="px-5 py-4 border-b border-border">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
    </div>
    <div className="p-5 space-y-4">{children}</div>
  </div>
);

const FieldRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-6">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      {description && <p className="text-xs text-text-secondary mt-0.5">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const Toggle = ({ defaultChecked }: { defaultChecked?: boolean }) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" defaultChecked={defaultChecked} className="sr-only peer" />
    <div className="w-10 h-5 bg-border peer-checked:bg-primary rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
  </label>
);

export const SettingsPage = () => {
  const farms = useSelector(selectAllFarms);
  const devices = useSelector(selectAllDevices);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-0.5">Manage your account and system preferences</p>
      </div>

      {/* Account */}
      <Section title="Account">
        <FieldRow label="Display Name" description="Your public name in the dashboard">
          <input
            type="text"
            defaultValue="Carlos Rivera"
            className="px-3 py-1.5 rounded-btn border border-border bg-surface text-text-primary text-sm w-48 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </FieldRow>
        <FieldRow label="Email" description="Notifications and login email">
          <input
            type="email"
            defaultValue="admin@cultivoiot.com"
            className="px-3 py-1.5 rounded-btn border border-border bg-surface text-text-primary text-sm w-48 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </FieldRow>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <FieldRow label="Device offline alerts" description="Get notified when a device goes offline">
          <Toggle defaultChecked />
        </FieldRow>
        <FieldRow label="Device error alerts" description="Get notified on device errors">
          <Toggle defaultChecked />
        </FieldRow>
        <FieldRow label="Low battery warnings" description="Alert when battery drops below 20%">
          <Toggle defaultChecked />
        </FieldRow>
        <FieldRow label="Weekly summary email" description="Receive a weekly report email">
          <Toggle />
        </FieldRow>
      </Section>

      {/* Data */}
      <Section title="Data & Refresh">
        <FieldRow label="Data refresh interval" description="How often live data is polled">
          <select className="px-3 py-1.5 rounded-btn border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
            <option>Every 30 seconds</option>
            <option>Every 1 minute</option>
            <option>Every 5 minutes</option>
          </select>
        </FieldRow>
        <FieldRow label="History retention" description="How long historical data is kept">
          <select className="px-3 py-1.5 rounded-btn border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
            <option>7 days</option>
            <option>30 days</option>
            <option>90 days</option>
          </select>
        </FieldRow>
      </Section>

      {/* System summary */}
      <Section title="System Summary">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-btn bg-background border border-border p-4 text-center">
            <div className="text-2xl font-bold text-text-primary">{farms.length}</div>
            <div className="text-xs text-text-secondary mt-0.5">Registered Farms</div>
          </div>
          <div className="rounded-btn bg-background border border-border p-4 text-center">
            <div className="text-2xl font-bold text-text-primary">{devices.length}</div>
            <div className="text-xs text-text-secondary mt-0.5">Registered Devices</div>
          </div>
          <div className="rounded-btn bg-background border border-border p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {devices.filter((d) => d.status === "online").length}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">Online Now</div>
          </div>
          <div className="rounded-btn bg-background border border-border p-4 text-center">
            <div className="text-2xl font-bold text-rose-600">
              {devices.filter((d) => d.status === "error").length}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">Active Errors</div>
          </div>
        </div>
      </Section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          className="px-5 py-2.5 rounded-btn bg-primary text-text-inverted text-sm font-medium hover:bg-primary-light transition-colors cursor-pointer"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};
