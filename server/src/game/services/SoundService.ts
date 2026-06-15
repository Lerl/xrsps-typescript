import type { SoundBroadcastRequest } from "../../network/managers/SoundManager";
import { encodeMessage } from "../../network/messages";
import type { ServerServices } from "../ServerServices";
import type { PlayerState } from "../player";
import type { PendingLocAnimation } from "../systems/BroadcastScheduler";

export class SoundService {
    constructor(private readonly services: ServerServices) {}

    playLocGraphic(opts: {
        spotId: number;
        tile: { x: number; y: number };
        level?: number;
        height?: number;
        delayTicks?: number;
    }): void {
        if (!opts || !(opts.spotId > 0)) return;
        const delay = opts.delayTicks !== undefined ? Math.max(0, opts.delayTicks) : 0;
        const tick = this.services.ticker.currentTick();
        this.services.broadcastService.enqueueSpotAnimation({
            tick,
            spotId: opts.spotId,
            delay,
            height: opts.height,
            tile: { x: opts.tile.x, y: opts.tile.y, level: opts.level ?? 0 },
        });
    }

    playLocAnimation(opts: {
        playerId?: number;
        locId: number;
        tile: { x: number; y: number };
        level?: number;
        shape?: number;
        rotation?: number;
        animId: number;
    }): void {
        if (!opts || !(opts.locId > 0) || !(opts.animId > 0)) return;
        const event: PendingLocAnimation = {
            locId: opts.locId | 0,
            tile: { x: opts.tile.x | 0, y: opts.tile.y | 0 },
            level: opts.level ?? 0,
            shape: opts.shape ?? 10,
            rotation: opts.rotation ?? 0,
            animId: opts.animId | 0,
        };
        if (opts.playerId !== undefined && Number.isFinite(opts.playerId)) {
            event.playerId = opts.playerId | 0;
        }
        this.services.broadcastService.enqueueLocAnimation(event);
    }

    playLocSound(opts: {
        soundId: number;
        tile?: { x: number; y: number };
        level?: number;
        loops?: number;
        delayMs?: number;
        radius?: number;
        attenuation?: number;
    }): void {
        if (!opts || !(opts.soundId > 0)) return;
        const payload: SoundBroadcastRequest = {
            soundId: opts.soundId,
            x: opts.tile?.x ?? 0,
            y: opts.tile?.y ?? 0,
            level: opts.level ?? 0,
        };
        if (opts.loops !== undefined) payload.loops = Math.max(1, opts.loops);
        // Wire delay is in client cycles (20ms each)
        if (opts.delayMs !== undefined) payload.delay = Math.max(0, Math.round(opts.delayMs / 20));
        if (opts.radius !== undefined && opts.radius > 0) {
            payload.radius = Math.min(31, Math.max(0, opts.radius));
        }
        if (opts.attenuation !== undefined && opts.attenuation > 0) {
            payload.attenuation = Math.min(31, Math.max(0, opts.attenuation));
        }
        this.services.networkLayer.withDirectSendBypass("script_loc_sound", () =>
            this.services.broadcastService.broadcastSound(payload, "script_loc_sound"),
        );
    }

    playAreaSound(opts: {
        soundId: number;
        tile: { x: number; y: number };
        level?: number;
        radius?: number;
        attenuation?: number;
        /** Delay in server ticks before the sound plays. */
        delay?: number;
    }): void {
        if (!opts || !(opts.soundId > 0)) return;
        const payload: SoundBroadcastRequest = {
            soundId: opts.soundId,
            x: opts.tile.x,
            y: opts.tile.y,
            level: opts.level ?? 0,
        };
        if (opts.radius !== undefined && opts.radius > 0) {
            payload.radius = Math.min(31, Math.max(0, opts.radius));
        }
        if (opts.attenuation !== undefined && opts.attenuation > 0) {
            payload.attenuation = Math.min(31, Math.max(0, opts.attenuation));
        }
        if (opts.delay !== undefined && opts.delay > 0) {
            // Server ticks (600ms) to client cycles (20ms)
            payload.delay = opts.delay * 30;
        }
        this.services.networkLayer.withDirectSendBypass("area_sound", () =>
            this.services.broadcastService.broadcastSound(payload, "area_sound"),
        );
    }

    sendSound(
        player: PlayerState,
        soundId: number,
        opts?: { delayMs?: number; loops?: number },
    ): void {
        this.services.soundManager!.sendSound(player, soundId, {
            delay:
                opts?.delayMs !== undefined
                    ? Math.max(0, Math.round(opts.delayMs / 20))
                    : undefined,
            loops: opts?.loops,
        });
    }

    sendJingle(player: PlayerState, jingleId: number, delay: number = 0): void {
        const sock = this.services.players?.getSocketByPlayerId(player.id);
        if (!sock || jingleId < 0) return;
        this.services.networkLayer.withDirectSendBypass("jingle", () =>
            this.services.networkLayer.sendWithGuard(
                sock,
                encodeMessage({
                    type: "play_jingle",
                    payload: {
                        jingleId,
                        delay: Math.max(0, Math.min(0xffffff, delay)),
                    },
                }),
                "jingle",
            ),
        );
    }

    getMusicTrackIdByName(trackName: string): number {
        return this.services.musicCatalogService?.getTrackByName(trackName)?.trackId ?? -1;
    }
}
