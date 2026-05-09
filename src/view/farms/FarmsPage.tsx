import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  selectAllFarms,
  selectFarmsSearch,
  setFarmsSearch,
} from "@store/slices/farmsSlice";
import { FarmCard } from "@shared/components/ui/FarmCard";
import { StatCard } from "@shared/components/ui/StatCard";
import { SearchInput } from "@shared/components/ui/SearchInput";
import { Modal } from "@shared/components/ui/Modal";
import type { FarmSummary } from "@appTypes/farm.types";
import { addFarm } from "@store/slices/farmsSlice";

export const FarmsPage = () => {
  const dispatch = useDispatch();
  const farms = useSelector(selectAllFarms);
  const searchQuery = useSelector(selectFarmsSearch);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const filtered = farms.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.location.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalDevices = farms.reduce((s, f) => s + f.totalDevices, 0);
  const totalOnline = farms.reduce((s, f) => s + f.onlineDevices, 0);
  const totalAlerts = farms.reduce((s, f) => s + f.alertCount, 0);

  const handleAddFarm = () => {
    if (!formName.trim()) return;
    const newFarm: FarmSummary = {
      id: `farm-${Date.now()}`,
      name: formName,
      location: formLocation,
      description: formDesc,
      ownerId: "u-001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalDevices: 0,
      onlineDevices: 0,
      offlineDevices: 0,
      alertCount: 0,
    };
    dispatch(addFarm(newFarm));
    setFormName("");
    setFormLocation("");
    setFormDesc("");
    setIsModalOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Farms</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage your IoT-connected agricultural sites
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Farm
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Farms"
          value={farms.length}
          icon="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          color="primary"
        />
        <StatCard
          label="Total Devices"
          value={totalDevices}
          icon="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          color="sky"
        />
        <StatCard
          label="Online Devices"
          value={totalOnline}
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          color="emerald"
        />
        <StatCard
          label="Active Alerts"
          value={totalAlerts}
          icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          color="rose"
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={searchQuery}
          onChange={(v) => dispatch(setFarmsSearch(v))}
          placeholder="Search farms by name or location…"
          className="flex-1 max-w-sm"
        />
        <span className="text-xs text-text-secondary shrink-0">
          {filtered.length} of {farms.length}
        </span>
      </div>

      {/* Farms grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-card bg-background border border-border flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-text-secondary text-sm">No farms found</p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => dispatch(setFarmsSearch(""))}
              className="mt-2 text-xs text-primary hover:underline cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((farm) => (
            <FarmCard key={farm.id} farm={farm} />
          ))}
        </div>
      )}

      {/* Add Farm Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Farm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-btn text-sm text-text-secondary hover:text-text-primary hover:bg-background transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddFarm}
              disabled={!formName.trim()}
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Create Farm
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Farm Name *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Hacienda Norte"
              className="w-full px-3 py-2 rounded-btn border border-border bg-surface text-text-primary placeholder-text-secondary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Location</label>
            <input
              type="text"
              value={formLocation}
              onChange={(e) => setFormLocation(e.target.value)}
              placeholder="e.g. Monterrey, NL"
              className="w-full px-3 py-2 rounded-btn border border-border bg-surface text-text-primary placeholder-text-secondary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Description</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Short description of this farm…"
              rows={3}
              className="w-full px-3 py-2 rounded-btn border border-border bg-surface text-text-primary placeholder-text-secondary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
