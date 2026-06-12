import { EventEmitter } from "events";

import { logger } from "../utils/logger";

export interface TickEvent {
    tick: number;
    time: number; // ms since epoch
}

export interface TickerStats {
    tick: number;
    // Times the loop gave up catching up and re-anchored the schedule.
    catchUpGiveUps: number;
    // Ticks dropped (never dispatched) across all give-ups.
    ticksSkipped: number;
    // Times the tick timer fired later than the drift warning threshold.
    lateFires: number;
}

export declare interface GameTicker {
    on(event: "tick", listener: (data: TickEvent) => void | Promise<void>): this;
}

const DEFAULT_MAX_CATCH_UP_TICKS = 5;

export class GameTicker extends EventEmitter {
    private timer: NodeJS.Timeout | null = null;
    private tickIdx = 0;
    private readonly tickMs: number;
    private readonly maxCatchUpTicks: number;
    private readonly driftWarnMs: number;
    private readonly clock: () => number;
    private running = false;
    private lastScheduledAt = 0;
    // Incremented on every start()/stop() so an in-flight async tick loop from a
    // previous run can detect it has been superseded and bail out instead of
    // racing a newly scheduled loop.
    private epoch = 0;
    private catchUpGiveUps = 0;
    private ticksSkipped = 0;
    private lateFires = 0;

    constructor(tickMs: number, opts?: { maxCatchUpTicks?: number; clock?: () => number }) {
        super();
        this.tickMs = Math.max(1, tickMs);
        this.maxCatchUpTicks = Math.max(1, opts?.maxCatchUpTicks ?? DEFAULT_MAX_CATCH_UP_TICKS);
        this.clock = opts?.clock ?? Date.now;
        this.driftWarnMs = Math.max(this.tickMs, Math.floor(this.tickMs * 1.5));
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.epoch++;
        this.lastScheduledAt = this.clock();
        this.scheduleNext(this.epoch);
    }

    stop(): void {
        this.running = false;
        this.epoch++;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    currentTick(): number {
        return this.tickIdx;
    }

    stats(): TickerStats {
        return {
            tick: this.tickIdx,
            catchUpGiveUps: this.catchUpGiveUps,
            ticksSkipped: this.ticksSkipped,
            lateFires: this.lateFires,
        };
    }

    private scheduleNext(epoch: number): void {
        if (!this.running || epoch !== this.epoch) return;
        const nextTarget = this.lastScheduledAt + this.tickMs;
        const delay = Math.max(0, nextTarget - this.clock());
        this.timer = setTimeout(() => {
            this.tickLoop(epoch).catch((err) => {
                logger.error("[GameTicker] tick loop exception", err);
            });
        }, delay);
    }

    private async tickLoop(epoch: number): Promise<void> {
        if (!this.running || epoch !== this.epoch) return;
        const lateMs = this.clock() - (this.lastScheduledAt + this.tickMs);
        if (lateMs > this.driftWarnMs) {
            this.lateFires++;
            logger.warn(
                `[GameTicker] tick timer fired ${lateMs}ms late (budget=${this.tickMs}ms, total late fires=${this.lateFires}); event loop is starved`,
            );
        }
        let iterations = 0;
        try {
            while (
                this.running &&
                epoch === this.epoch &&
                this.clock() >= this.lastScheduledAt + this.tickMs
            ) {
                const scheduledTime = this.lastScheduledAt + this.tickMs;
                this.lastScheduledAt = scheduledTime;
                await this.dispatchTick(scheduledTime);
                iterations++;
                const now = this.clock();
                const behindMs = now - this.lastScheduledAt;
                if (behindMs >= this.tickMs) {
                    if (iterations >= this.maxCatchUpTicks) {
                        const skipped = Math.floor(behindMs / this.tickMs);
                        this.catchUpGiveUps++;
                        this.ticksSkipped += skipped;
                        logger.warn(
                            `[GameTicker] unable to catch up after ${iterations} ticks (behind ${behindMs}ms); ` +
                                `skipping ${skipped} tick(s) (lifetime: ${this.catchUpGiveUps} give-ups, ${this.ticksSkipped} skipped)`,
                        );
                        this.lastScheduledAt = now;
                        break;
                    }
                    continue;
                }
                break;
            }
        } finally {
            this.scheduleNext(epoch);
        }
    }

    private async dispatchTick(time: number): Promise<void> {
        const payload: TickEvent = { tick: ++this.tickIdx, time: Math.floor(time) };
        const listeners = this.listeners("tick") as ((data: TickEvent) => void | Promise<void>)[];
        for (const listener of listeners) {
            try {
                await listener.call(this, payload);
            } catch (err) {
                logger.error("[GameTicker] tick listener threw", err);
            }
        }
    }
}
