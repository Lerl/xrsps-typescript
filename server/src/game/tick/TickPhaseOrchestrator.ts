import { performance } from "perf_hooks";

import type { TickFrame } from "../../network/wsServerTypes";
import { logger } from "../../utils/logger";
import type { ServerServices } from "../ServerServices";

export type { TickFrame };

export interface TickPhase {
    name: string;
    fn: () => void | Promise<void>;
    yieldAfter?: boolean;
    // Set on the stage that transmits the frame's drained buffers. If it fails,
    // the buffers are restored so they are delivered next tick instead of lost.
    restoreFrameOnFailure?: boolean;
}

export class TickPhaseOrchestrator {
    private profileEnabled: boolean;

    constructor(private readonly svc: ServerServices) {
        this.profileEnabled = (process.env.TICK_PROFILE ?? "") === "1";
    }

    async processTick(tick: number, time: number): Promise<void> {
        const startedAt = performance.now();
        const stageTimes: Array<{ name: string; ms: number }> = [];

        // Drain queued client packets before the frame snapshot so their
        // effects are captured by this tick's frame and broadcast this tick.
        const inputStart = performance.now();
        try {
            this.svc.clientInputService.drain();
        } catch (err) {
            logger.error(`[tick] stage client_input failed (tick=${tick})`, err);
        }
        stageTimes.push({ name: "client_input", ms: performance.now() - inputStart });

        const frame = this.svc.tickFrameService.createTickFrame({ tick, time });
        this.svc.activeFrame = frame;

        try {
            for (const stage of this.buildPhaseList(frame)) {
                const stageStart = performance.now();
                await this.runTickStage(stage, frame);
                stageTimes.push({ name: stage.name, ms: performance.now() - stageStart });

                if (stage.yieldAfter) {
                    const yieldStart = performance.now();
                    await this.svc.tickFrameService.yieldToEventLoop(stage.name);
                    stageTimes.push({
                        name: `${stage.name}:yield`,
                        ms: performance.now() - yieldStart,
                    });
                }
            }

            this.logTickTiming(frame.tick, performance.now() - startedAt, stageTimes);
        } finally {
            this.svc.activeFrame = undefined;
            this.svc.tickFrameService.maybeRunAutosave(frame);
        }
    }

    private buildPhaseList(frame: TickFrame): TickPhase[] {
        const tps = this.svc.tickPhaseService;
        return [
            {
                name: "broadcast",
                fn: () => this.svc.broadcastService.broadcastTick(frame),
                yieldAfter: true,
            },
            {
                name: "pre_movement",
                fn: () => tps.runPreMovementPhase(frame),
                yieldAfter: true,
            },
            { name: "movement", fn: () => tps.runMovementPhase(frame) },
            { name: "music", fn: () => tps.runMusicPhase(frame) },
            { name: "scripts", fn: () => tps.runScriptPhase(frame) },
            { name: "combat", fn: () => tps.runCombatPhase(frame) },
            { name: "death", fn: () => tps.runDeathPhase(frame) },
            { name: "post_scripts", fn: () => tps.runPostScriptPhase(frame) },
            { name: "post_effects", fn: () => tps.runPostEffectsPhase(frame) },
            {
                name: "orphaned_players",
                fn: () => tps.runOrphanedPlayersPhase(frame),
            },
            { name: "scheduled_scripts", fn: () => tps.runScheduledScriptsPhase(frame) },
            {
                name: "broadcast_phase",
                fn: () => tps.runBroadcastPhase(frame),
                restoreFrameOnFailure: true,
            },
        ];
    }

    private async runTickStage(stage: TickPhase, frame: TickFrame): Promise<void> {
        try {
            await stage.fn();
        } catch (err) {
            logger.error(`[tick] stage ${stage.name} failed (tick=${frame.tick})`, err);
            if (stage.restoreFrameOnFailure) {
                this.svc.tickFrameService.restorePendingFrame(frame);
            }
        }
    }

    private logTickTiming(
        tick: number,
        elapsedMs: number,
        stageTimes: Array<{ name: string; ms: number }>,
    ): void {
        const tickMs = this.svc.tickMs;

        if (elapsedMs > tickMs) {
            logger.warn(
                `[tick] tick ${tick} exceeded budget: ${elapsedMs.toFixed(1)}ms > ${tickMs}ms`,
            );
            stageTimes.sort((a, b) => b.ms - a.ms);
            const top = stageTimes.slice(0, 5);
            logger.warn(
                `[tick] breakdown tick=${tick} total=${elapsedMs.toFixed(1)}ms ` +
                    top.map((t) => `${t.name}=${t.ms.toFixed(1)}ms`).join(" "),
            );
        } else if (this.profileEnabled) {
            stageTimes.sort((a, b) => b.ms - a.ms);
            const top = stageTimes.slice(0, 5);
            logger.info(
                `[tick] breakdown tick=${tick} total=${elapsedMs.toFixed(1)}ms ` +
                    top.map((t) => `${t.name}=${t.ms.toFixed(1)}ms`).join(" "),
            );
        }
    }
}
