export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";
export class LiveClient {
  private socket: WebSocket | null = null;
  private stopped = true;
  private retry?: ReturnType<typeof setTimeout>;
  private startup?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private topics = new Set<string>();
  private lastMessage = Date.now();
  constructor(
    private origin: string,
    private token: () => string | null,
    private change: (topics: string[]) => void,
    private status: (status: LiveStatus) => void = () => {},
  ) {}
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    // React development checks mount, clean up, then mount effects again.
    // Wait one turn so that discarded mounts never start an upgrade request.
    this.startup = setTimeout(() => this.connect(), 0);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.startup);
    clearTimeout(this.retry);
    clearTimeout(this.debounce);
    clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = null;
    this.topics.clear();
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = () => {};
      // Closing CONNECTING aborts the HTTP upgrade and can leave the dev
      // proxy writing to a broken pipe. Finish the handshake, then close.
      if (socket.readyState === 0) socket.onopen = () => socket.close();
      else {
        socket.onopen = null;
        if (socket.readyState === 1) socket.close();
      }
    }
    this.status("offline");
  }
  reconnect() {
    this.stop();
    this.start();
  }
  private invalidate(topics: string[]) {
    for (const topic of topics) this.topics.add(topic);
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      const next = [...this.topics];
      this.topics.clear();
      this.change(next);
    }, 100);
  }
  private connect() {
    if (this.stopped) return;
    this.status(this.attempt ? "reconnecting" : "connecting");
    try {
      const socket = new WebSocket(
        `${this.origin.replace(/\/$/, "").replace(/^http/, "ws")}/api/live`,
      );
      this.socket = socket;
      socket.onopen = () => {
        if (this.socket !== socket || this.stopped) return;
        this.lastMessage = Date.now();
        const token = this.token();
        if (token) socket.send(JSON.stringify({ type: "authenticate", token }));
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastMessage > 45000) {
            socket.close();
            return;
          }
          if (socket.readyState === 1)
            socket.send(JSON.stringify({ type: "ping" }));
        }, 15000);
      };
      socket.onmessage = (event) => {
        if (this.stopped || this.socket !== socket) return;
        this.lastMessage = Date.now();
        try {
          const m = JSON.parse(String(event.data));
          if (m.type === "ready") {
            this.attempt = 0;
            this.status("live");
            this.invalidate(["all"]);
          }
          if (m.type === "changed" && Array.isArray(m.topics))
            this.invalidate(
              m.topics.filter((v: unknown) => typeof v === "string"),
            );
          if (m.type === "session-expired") this.invalidate(["account"]);
        } catch {}
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (this.socket !== socket) return;
        clearInterval(this.heartbeat);
        this.socket = null;
        if (this.stopped) return;
        this.status("reconnecting");
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(15000, 500 * 2 ** this.attempt++) + Math.random() * 300,
        );
      };
    } catch {
      this.status("reconnecting");
      this.retry = setTimeout(() => this.connect(), 3000);
    }
  }
}
