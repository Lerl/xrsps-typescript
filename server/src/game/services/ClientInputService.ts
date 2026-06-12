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

    constructor(private readonly svc: ServerServices) {}

    registerConnection(ws: WebSocket, handler: RawMessageHandler): void {
        this.handlers.set(ws, handler);
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
        for (const [ws, queue] of this.queues) {
            this.queues.delete(ws);
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
    }

    removeConnection(ws: WebSocket): void {
        this.handlers.delete(ws);
        this.queues.delete(ws);
    }
}
