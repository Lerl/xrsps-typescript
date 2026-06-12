import { WebSocket } from "ws";
import type { RawData } from "ws";

import { logger } from "../../utils/logger";
import type { ServerServices } from "../ServerServices";

export type RawMessageHandler = (raw: RawData) => void;

/**
 * Maximum client messages queued per connection per tick. Messages arriving
 * beyond the cap are dropped until the queue drains.
 */
const MAX_QUEUED_MESSAGES_PER_TICK = 30;

/**
 * Per-connection FIFO of raw client messages, drained at a fixed point at the
 * start of each game tick. Socket reads only enqueue; game state is never
 * mutated mid-tick by packet arrival, so packet handling is deterministic with
 * respect to the tick phases.
 */
export class ClientInputService {
    private readonly handlers = new Map<WebSocket, RawMessageHandler>();
    private readonly queues = new Map<WebSocket, RawData[]>();
    private draining = false;

    constructor(private readonly svc: ServerServices) {}

    registerConnection(ws: WebSocket, handler: RawMessageHandler): void {
        this.handlers.set(ws, handler);
    }

    /**
     * True while drain() is executing queued messages, i.e. the current call
     * stack is inside the client_input tick phase. Drain is fully synchronous,
     * so handlers can use this to tell tick-time processing apart from
     * arrival-time processing.
     */
    isDraining(): boolean {
        return this.draining;
    }

    hasQueued(ws: WebSocket): boolean {
        return this.queues.has(ws);
    }

    enqueue(ws: WebSocket, raw: RawData): void {
        let queue = this.queues.get(ws);
        if (!queue) {
            queue = [];
            this.queues.set(ws, queue);
        }
        if (queue.length >= MAX_QUEUED_MESSAGES_PER_TICK) {
            logger.warn(
                `[client_input] dropping message; queue full (${queue.length}) for player ${
                    this.svc.players?.get(ws)?.id ?? "?"
                }`,
            );
            return;
        }
        queue.push(raw);
    }

    drain(): void {
        if (this.queues.size === 0) return;
        this.draining = true;
        try {
            const entries = Array.from(this.queues.entries());
            this.queues.clear();
            // World-entry (pre-login) queues first in arrival order, then
            // players in id order, matching the engine cycle of login
            // registration followed by per-player message handling.
            const playerIds = new Map<WebSocket, number | undefined>();
            for (const [ws] of entries) {
                playerIds.set(ws, this.svc.players?.get(ws)?.id);
            }
            entries.sort((a, b) => {
                const pa = playerIds.get(a[0]);
                const pb = playerIds.get(b[0]);
                if (pa === undefined) return pb === undefined ? 0 : -1;
                if (pb === undefined) return 1;
                return pa - pb;
            });
            for (const [ws, queue] of entries) {
                if (ws.readyState !== WebSocket.OPEN) continue;
                const handler = this.handlers.get(ws);
                if (!handler) continue;
                for (const raw of queue) {
                    try {
                        handler(raw);
                    } catch (err) {
                        logger.error("[client_input] message handler threw", err);
                    }
                }
            }
        } finally {
            this.draining = false;
        }
    }

    removeConnection(ws: WebSocket): void {
        this.handlers.delete(ws);
        this.queues.delete(ws);
    }
}
