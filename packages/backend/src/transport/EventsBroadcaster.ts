import type { WebSocket } from 'ws';
import type { EventsServerMessage } from '@ttymux/shared';

/** Fan-out for `/ws/events` subscribers: dashboard-wide port add/remove/status deltas. */
export class EventsBroadcaster {
  private readonly sockets = new Set<WebSocket>();

  subscribe(socket: WebSocket): void {
    this.sockets.add(socket);
  }

  unsubscribe(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  broadcast(message: EventsServerMessage): void {
    const json = JSON.stringify(message);
    for (const socket of this.sockets) {
      if (socket.readyState === socket.OPEN) socket.send(json);
    }
  }
}
