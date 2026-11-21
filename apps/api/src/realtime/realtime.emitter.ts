import {
  makeEnvelope,
  type CommandDto,
  type ConnectivityData,
  type DeviceEventDto,
  type DeviceStateDto,
  type RelayStateData,
  type ServerToClientEvents,
  type SocketEnvelope,
  type TelemetryPointDto,
} from "@cimcms/contracts";

type ServerEventName = keyof ServerToClientEvents;

/** Transport behind the emitter. The Socket.IO gateway installs one; the default drops everything. */
export interface RealtimeSink {
  /** Deliver `envelope` to everyone subscribed to `deviceId`. */
  emit(deviceId: string, event: ServerEventName, envelope: SocketEnvelope<unknown>): void;
}

const noopSink: RealtimeSink = { emit: () => undefined };

/**
 * Static facade used by services to push live updates (plan 5.7).
 * Services never touch Socket.IO directly; tests can install a recording sink.
 */
export class RealtimeEmitter {
  private static sink: RealtimeSink = noopSink;

  /** Install a transport. Pass null to go back to the no-op sink. */
  static setSink(sink: RealtimeSink | null): void {
    RealtimeEmitter.sink = sink ?? noopSink;
  }

  private static send(deviceId: string, event: ServerEventName, data: unknown): void {
    try {
      RealtimeEmitter.sink.emit(deviceId, event, makeEnvelope(deviceId, data));
    } catch {
      // Realtime is best effort: a failed push must never fail ingest or a request.
    }
  }

  static deviceStatus(deviceId: string, dto: DeviceStateDto): void {
    RealtimeEmitter.send(deviceId, "device:status", dto);
  }

  static telemetry(deviceId: string, dto: TelemetryPointDto): void {
    RealtimeEmitter.send(deviceId, "device:telemetry", dto);
  }

  static relayState(deviceId: string, data: RelayStateData): void {
    RealtimeEmitter.send(deviceId, "device:relay_state", data);
  }

  static connectivity(deviceId: string, data: ConnectivityData): void {
    RealtimeEmitter.send(deviceId, "device:connectivity", data);
  }

  static deviceEvent(deviceId: string, dto: DeviceEventDto): void {
    RealtimeEmitter.send(deviceId, "device:event", dto);
  }

  static commandUpdated(dto: CommandDto): void {
    RealtimeEmitter.send(dto.deviceId, "command:updated", dto);
  }
}

export default RealtimeEmitter;
