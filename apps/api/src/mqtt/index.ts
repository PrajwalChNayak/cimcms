import MqttClient, { type ConnectOptions } from "./mqtt.client";
import MqttDispatcher from "./mqtt.dispatcher";

/** Wires the dispatcher to the client and connects. */
export async function startMqtt(opts: ConnectOptions = {}): Promise<void> {
  MqttDispatcher.attach();
  await MqttClient.connect(opts);
}
