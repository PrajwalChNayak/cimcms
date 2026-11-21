type Listener = (...args: unknown[]) => void;

/** Minimal in-memory Socket.IO client double. */
export class FakeSocket {
  connected = false;
  active = true;
  emitted: Array<{ event: string; args: unknown[] }> = [];
  connectCalls = 0;
  disconnectCalls = 0;
  private listeners = new Map<string, Set<Listener>>();
  constructor(
    public url: string,
    public opts: {
      path: string;
      transports: string[];
      auth: (cb: (d: object) => void) => void;
    },
  ) {}
  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return this;
  }
  removeAllListeners() {
    this.listeners.clear();
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args });
    return this;
  }
  connect() {
    this.connectCalls += 1;
    return this;
  }
  disconnect() {
    this.disconnectCalls += 1;
    this.connected = false;
    return this;
  }
  /** test helpers */
  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }
  serverConnects() {
    this.connected = true;
    this.trigger("connect");
  }
  subscribes() {
    return this.emitted
      .filter((e) => e.event === "subscribe:device")
      .map((e) => (e.args[0] as { deviceId: string }).deviceId);
  }
}

/** Every socket created through the mocked `io()`; tests inspect the latest. */
export const sockets: FakeSocket[] = [];

export const createFakeIo = () =>
  (url: string, opts: FakeSocket["opts"]) => {
    const s = new FakeSocket(url, opts);
    sockets.push(s);
    return s;
  };
