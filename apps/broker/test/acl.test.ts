import { describe, expect, it } from "vitest";
import { canPublish, canSubscribe, filterCovers, topicMatches, type AclAccount } from "../src/acl.js";

const device: AclAccount = { username: "LED-02", kind: "DEVICE", deviceId: "LED-02", deviceType: "LED_CONTROLLER" };
const service: AclAccount = { username: "cimcms-api", kind: "SERVICE", deviceId: null, deviceType: null };
const legacy: AclAccount = { username: "mqttuser", kind: "LEGACY", deviceId: null, deviceType: null };

describe("topicMatches", () => {
  it.each([
    ["a/b/c", "a/b/c", true],
    ["a/+/c", "a/b/c", true],
    ["a/+/c", "a/b/d", false],
    ["a/#", "a/b/c", true],
    ["a/#", "a", true],
    ["#", "x/y", true],
    ["a/+", "a/b/c", false],
    ["a/b/c", "a/b", false],
    ["+/+", "a/b", true],
    ["a/b", "a/b/c", false],
  ])("%s vs %s -> %s", (filter, topic, want) => {
    expect(topicMatches(filter, topic)).toBe(want);
  });
});

describe("filterCovers", () => {
  it.each([
    ["cimcms/+/+/status", "cimcms/+/+/status", true],
    ["cimcms/+/+/status", "cimcms/led/+/status", true],
    ["cimcms/+/+/status", "cimcms/led/LED-02/status", true],
    ["cimcms/+/+/status", "cimcms/#", false],
    ["cimcms/+/+/status", "cimcms/+/+/#", false],
    ["cimcms/+/+/status", "cimcms/+/+/+", false],
    ["cimcms/+/+/status", "#", false],
    ["cimcms/+/+/status", "cimcms/+/status", false],
    ["cimcms/+/+/status", "cimcms/+/+/status/x", false],
    ["cimcms/#", "cimcms/+/+/#", true],
    ["cimcms/#", "cimcms", true],
    ["a/b", "a/+", false],
  ])("%s covers %s -> %s", (allowed, requested, want) => {
    expect(filterCovers(allowed, requested)).toBe(want);
  });
});

describe("canPublish", () => {
  it("DEVICE: only its own status/telemetry/ack/event", () => {
    for (const k of ["status", "telemetry", "ack", "event"]) {
      expect(canPublish(device, `cimcms/led/LED-02/${k}`)).toBe(true);
    }
    expect(canPublish(device, "cimcms/led/LED-02/command")).toBe(false);
    expect(canPublish(device, "cimcms/led/LED-02/config")).toBe(false);
    expect(canPublish(device, "cimcms/led/LED-03/telemetry")).toBe(false);
    expect(canPublish(device, "cimcms/humidifier/LED-02/status")).toBe(false);
    expect(canPublish(device, "cimcms/backend/status")).toBe(false);
    expect(canPublish(device, "cimcms/broker/account-changed")).toBe(false);
    expect(canPublish(device, "test")).toBe(false);
    expect(canPublish(device, "$SYS/x")).toBe(false);
  });

  it("DEVICE: broken account (unknown/missing device type or id) may publish nothing", () => {
    for (const deviceType of ["NOPE", "constructor", "toString", "__proto__", null]) {
      const broken: AclAccount = { ...device, deviceType };
      expect(canPublish(broken, "cimcms/led/LED-02/telemetry")).toBe(false);
      expect(canPublish(broken, "cimcms/undefined/LED-02/telemetry")).toBe(false);
    }
    expect(canPublish({ ...device, deviceId: null }, "cimcms/led/LED-02/telemetry")).toBe(false);
    expect(canPublish({ ...device, deviceId: null }, "cimcms/led/null/telemetry")).toBe(false);
  });

  it("SERVICE: command/config of any device, backend status, account-changed", () => {
    expect(canPublish(service, "cimcms/led/LED-02/command")).toBe(true);
    expect(canPublish(service, "cimcms/humidifier/H-1/config")).toBe(true);
    expect(canPublish(service, "cimcms/backend/status")).toBe(true);
    expect(canPublish(service, "cimcms/broker/account-changed")).toBe(true);
    expect(canPublish(service, "cimcms/led/LED-02/telemetry")).toBe(false);
    expect(canPublish(service, "cimcms/led/LED-02/status")).toBe(false);
    expect(canPublish(service, "cimcms/led/LED-02/command/x")).toBe(false);
    expect(canPublish(service, "test")).toBe(false);
    expect(canPublish(service, "$SYS/broker")).toBe(false);
  });

  it("LEGACY: anything except account-changed and $ topics", () => {
    expect(canPublish(legacy, "test")).toBe(true);
    expect(canPublish(legacy, "cimcms/humidifier/H-1/status")).toBe(true);
    expect(canPublish(legacy, "cimcms/led/LED-02/command")).toBe(true);
    expect(canPublish(legacy, "cimcms/broker/account-changed")).toBe(false);
    expect(canPublish(legacy, "$SYS/x")).toBe(false);
  });
});

describe("canSubscribe", () => {
  it("DEVICE: only its own command/config, no wildcards", () => {
    expect(canSubscribe(device, "cimcms/led/LED-02/command")).toBe(true);
    expect(canSubscribe(device, "cimcms/led/LED-02/config")).toBe(true);
    expect(canSubscribe(device, "cimcms/led/LED-03/command")).toBe(false);
    expect(canSubscribe(device, "cimcms/led/+/command")).toBe(false);
    expect(canSubscribe(device, "cimcms/led/LED-02/#")).toBe(false);
    expect(canSubscribe(device, "cimcms/led/LED-02/telemetry")).toBe(false);
    expect(canSubscribe(device, "#")).toBe(false);
    expect(canSubscribe(device, "$SYS/#")).toBe(false);
  });

  it("DEVICE: broken account may subscribe to nothing", () => {
    expect(canSubscribe({ ...device, deviceType: "NOPE" }, "cimcms/led/LED-02/command")).toBe(false);
    expect(canSubscribe({ ...device, deviceType: "constructor" }, "cimcms/undefined/LED-02/command")).toBe(false);
    expect(canSubscribe({ ...device, deviceId: null }, "cimcms/led/null/command")).toBe(false);
  });

  it("SERVICE: device uplink topics and backend status, never wider", () => {
    expect(canSubscribe(service, "cimcms/+/+/status")).toBe(true);
    expect(canSubscribe(service, "cimcms/+/+/telemetry")).toBe(true);
    expect(canSubscribe(service, "cimcms/led/+/ack")).toBe(true);
    expect(canSubscribe(service, "cimcms/led/LED-02/event")).toBe(true);
    expect(canSubscribe(service, "cimcms/backend/status")).toBe(true);
    expect(canSubscribe(service, "cimcms/#")).toBe(false);
    expect(canSubscribe(service, "cimcms/+/+/#")).toBe(false);
    expect(canSubscribe(service, "cimcms/+/+/+")).toBe(false);
    expect(canSubscribe(service, "#")).toBe(false);
    expect(canSubscribe(service, "cimcms/+/+/command")).toBe(false);
    expect(canSubscribe(service, "cimcms/broker/account-changed")).toBe(false);
    expect(canSubscribe(service, "$SYS/#")).toBe(false);
  });

  it("LEGACY: everything except $ topics", () => {
    expect(canSubscribe(legacy, "#")).toBe(true);
    expect(canSubscribe(legacy, "test")).toBe(true);
    expect(canSubscribe(legacy, "cimcms/+/+/command")).toBe(true);
    expect(canSubscribe(legacy, "$SYS/#")).toBe(false);
  });
});
