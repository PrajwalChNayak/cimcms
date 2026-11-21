import net from "node:net";
import type { AddressInfo } from "node:net";
import { Aedes } from "aedes";

export interface TestBroker {
  /** mqtt://127.0.0.1:<random port> */
  url: string;
  port: number;
  aedes: Aedes;
  close: () => Promise<void>;
}

/**
 * Starts an in-process MQTT broker (aedes) on a random free port.
 * Anonymous access, no TLS - for tests only. Call close() in afterAll.
 */
export async function startTestBroker(): Promise<TestBroker> {
  const aedes = await Aedes.createBroker();
  const server = net.createServer(aedes.handle);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    url: `mqtt://127.0.0.1:${port}`,
    port,
    aedes,
    close: async () => {
      await new Promise<void>((resolve) => aedes.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
