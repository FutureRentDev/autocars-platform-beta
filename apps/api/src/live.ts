import type { WebSocket } from "ws";
type Identity = { id: string; role: string };
export type Change = { public?: boolean; users?: string[]; admin?: boolean };
export class LiveHub {
  private clients = new Map<
    WebSocket,
    { session?: string; authenticated: boolean; alive: boolean }
  >();
  private heartbeat: ReturnType<typeof setInterval>;
  constructor(private identify: (session: string) => Identity | undefined) {
    this.heartbeat = setInterval(() => {
      for (const [socket, c] of this.clients) {
        if (!c.alive) {
          socket.terminate();
          continue;
        }
        c.alive = false;
        socket.ping();
      }
    }, 25000);
    this.heartbeat.unref();
  }
  add(socket: WebSocket, session?: string) {
    const client = { session, authenticated: !!session, alive: true };
    this.clients.set(socket, client);
    socket.on("pong", () => {
      client.alive = true;
    });
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => {
      this.clients.delete(socket);
      socket.terminate();
    });
    let attempts = 0;
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "ping") {
          if (
            client.authenticated &&
            client.session &&
            !this.identify(client.session)
          ) {
            this.send(socket, { type: "session-expired" });
            socket.close(1008, "Session expired");
            return;
          }
          this.send(socket, { type: "pong" });
          return;
        }
        if (
          message.type !== "authenticate" ||
          typeof message.token !== "string" ||
          message.token.length > 200 ||
          ++attempts > 3
        ) {
          socket.close(1008, "Invalid message");
          return;
        }
        const identity = this.identify(message.token);
        if (!identity) {
          this.send(socket, { type: "session-expired" });
          socket.close(1008, "Session expired");
          return;
        }
        client.session = message.token;
        client.authenticated = true;
        this.send(socket, { type: "ready" });
      } catch {
        socket.close(1008, "Invalid message");
      }
    });
    this.send(socket, { type: "ready" });
  }
  private send(socket: WebSocket, message: unknown) {
    if (socket.readyState === 1) {
      if (socket.bufferedAmount > 256 * 1024) {
        socket.terminate();
        return;
      }
      socket.send(JSON.stringify(message));
    }
  }
  publish(change: Change) {
    for (const [socket, c] of this.clients) {
      const user = c.session ? this.identify(c.session) : undefined;
      if (c.authenticated && !user) {
        this.send(socket, { type: "session-expired" });
        socket.close(1008, "Session expired");
        continue;
      }
      const topics: string[] = [];
      if (change.public) topics.push("catalogue");
      if (
        user &&
        (change.users?.includes(user.id) ||
          (change.admin && user.role === "admin"))
      )
        topics.push(
          "account",
          "inventory",
          "enquiries",
          "garage",
          "businesses",
          "notifications",
          ...(user.role === "admin" ? ["admin"] : []),
        );
      if (topics.length)
        this.send(socket, { type: "changed", topics: [...new Set(topics)] });
    }
  }
  close() {
    clearInterval(this.heartbeat);
    for (const socket of this.clients.keys()) socket.terminate();
    this.clients.clear();
  }
}
