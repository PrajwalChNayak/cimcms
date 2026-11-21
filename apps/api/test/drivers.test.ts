import { backendSubscriptions, DEVICE_TYPES } from "@cimcms/contracts";
import { describe, expect, it } from "vitest";
import {
  allSubscriptions,
  getDriver,
  handlesKind,
  listDrivers,
  supportsAction,
} from "@/drivers/driver.registry";

describe("driver registry", () => {
  it("LED supports SET_RELAY, SET_ALL_RELAYS, REQUEST_STATUS but not SET_MODE", () => {
    expect(supportsAction("LED_CONTROLLER", "SET_RELAY")).toBe(true);
    expect(supportsAction("LED_CONTROLLER", "SET_ALL_RELAYS")).toBe(true);
    expect(supportsAction("LED_CONTROLLER", "REQUEST_STATUS")).toBe(true);
    expect(supportsAction("LED_CONTROLLER", "SET_MODE")).toBe(false);
  });

  it("HUMIDIFIER supports nothing", () => {
    for (const a of ["SET_RELAY", "SET_ALL_RELAYS", "REQUEST_STATUS", "SET_MODE", "RTC_SYNC_NOW"]) {
      expect(supportsAction("HUMIDIFIER", a)).toBe(false);
    }
    expect(handlesKind("HUMIDIFIER", "status")).toBe(true);
    expect(handlesKind("HUMIDIFIER", "telemetry")).toBe(false);
  });

  it("PLANNED types have no subscriptions", () => {
    expect(getDriver("STEAM_GENERATOR").subscriptions).toEqual([]);
    expect(getDriver("ENV_CONTROLLER").subscriptions).toEqual([]);
  });

  it("subscriptions equal backendSubscriptions() from contracts", () => {
    for (const monitorHumidifier of [true, false]) {
      expect(allSubscriptions({ monitorHumidifier })).toEqual(
        backendSubscriptions({ monitorHumidifier }),
      );
    }
    const all = listDrivers()
      .flatMap((d) => d.subscriptions)
      .sort();
    expect(all).toEqual(backendSubscriptions({ monitorHumidifier: true }).sort());
  });

  it("covers every device type and throws on unknown", () => {
    expect(listDrivers().map((d) => d.type).sort()).toEqual(Object.keys(DEVICE_TYPES).sort());
    expect(() => getDriver("TOASTER")).toThrow(/Unknown device type/);
    expect(() => supportsAction("TOASTER", "SET_RELAY")).toThrow();
  });
});
