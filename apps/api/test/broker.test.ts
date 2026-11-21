import { afterAll, beforeAll, expect, it } from "vitest";
import { startTestBroker, type TestBroker } from "./setup/broker";

let broker: TestBroker;

beforeAll(async () => {
  broker = await startTestBroker();
});

afterAll(async () => {
  await broker.close();
});

it("starts an in-process broker on a random port", () => {
  expect(broker.port).toBeGreaterThan(0);
  expect(broker.url).toBe(`mqtt://127.0.0.1:${broker.port}`);
});
