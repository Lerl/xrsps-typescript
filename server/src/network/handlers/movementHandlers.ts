import { logger } from "../../utils/logger";
import type { MessageHandlerServices } from "../MessageHandlers";
import { normalizeModifierFlags, resolveRunWithModifier } from "../MessageHandlers";
import type { MessageContext, MessageRouter } from "../MessageRouter";

function handleAdminTeleportRequest(
    ctx: MessageContext<"teleport"> | MessageContext<"world_map_click">,
    services: MessageHandlerServices,
    opts: { notifyUnauthorized: boolean; logContext: string },
): void {
    try {
        if (!ctx.player) return;
        if (!ctx.player.canMove()) return;
        if (!services.canUseAdminTeleport(ctx.player)) {
            if (opts.notifyUnauthorized) {
                services.queueChatMessage({
                    messageType: "game",
                    text: "Only admins can use world map teleports.",
                    targetPlayerIds: [ctx.player.id],
                });
            }
            return;
        }

        const { to, level } = ctx.payload;
        if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;

        const targetLevel = Math.max(
            0,
            Math.min(3, Number.isFinite(level) ? (level as number) | 0 : ctx.player.level),
        );
        services.interruptPlayerInput(ctx.player);
        services.clearAllInteractions(ctx.ws);
        ctx.player.resetInteractions();
        ctx.player.clearInteraction();
        services.clearActionsInGroup(ctx.player.id, "combat.attack");
        services.clearActionsInGroup(ctx.player.id, "combat.autocast");
        const result = services.requestTeleportAction(ctx.player, {
            x: to.x | 0,
            y: to.y | 0,
            level: targetLevel,
            delayTicks: 0,
            cooldownTicks: 1,
            requireCanTeleport: false,
            rejectIfPending: true,
            replacePending: false,
        });
        if (!result.ok) {
            if (result.reason === "cooldown") {
                services.queueChatMessage({
                    messageType: "game",
                    text: "You're already teleporting.",
                    targetPlayerIds: [ctx.player.id],
                });
            }
            return;
        }
    } catch (err) {
        logger.warn(`Failed to process ${opts.logContext} request`, err);
    }
}

export function registerMovementHandlers(
    router: MessageRouter,
    services: MessageHandlerServices,
): void {
    router.register("walk", (ctx) => {
        const to = ctx.payload.to;
        const modifierFlags = normalizeModifierFlags(ctx.payload.modifierFlags);
        logger.info(`[walk] received walk to (${to?.x}, ${to?.y}) player=${ctx.player?.id}`);

        if (!ctx.player) {
            logger.info("walk rejected: player not ready");
            return;
        }

        // Derive run state from server toggle and input flags
        const effectiveRun = ctx.player.energy.resolveRequestedRun(
            resolveRunWithModifier(ctx.player.energy.wantsToRun(), modifierFlags),
        );

        const nowTick = services.currentTick();
        services.setPendingWalkCommand(ctx.ws, {
            to: { x: to.x, y: to.y },
            run: effectiveRun,
            enqueuedTick: nowTick,
        });

        if (!ctx.player.canMove()) {
            return;
        }

        try {
            // Walking is player input: clears weak queue tasks and interruptible actions
            const removed = services.interruptPlayerInput(ctx.player);
            if (removed > 0) {
                ctx.player.clearInteraction();
                ctx.player.stopAnimation();
            }
        } catch (err) {
            logger.warn("Failed to interrupt actions on walk", err);
        }
    });

    router.register("teleport", (ctx) => {
        handleAdminTeleportRequest(ctx, services, {
            notifyUnauthorized: true,
            logContext: "teleport",
        });
    });

    router.register("world_map_click", (ctx) => {
        handleAdminTeleportRequest(ctx, services, {
            notifyUnauthorized: false,
            logContext: "world map click",
        });
    });

    router.register("face", (ctx) => {
        try {
            if (!ctx.player) return;
            const { rot, tile } = ctx.payload;
            if (rot !== undefined) {
                ctx.player.faceRot(rot);
            } else if (tile) {
                const tx = tile.x;
                const ty = tile.y;
                const targetX = (tx << 7) + 64;
                const targetY = (ty << 7) + 64;
                if (ctx.player.x !== targetX || ctx.player.y !== targetY) {
                    ctx.player.faceTile(tx, ty);
                }
            }
        } catch (err) {
            logger.warn("Failed to process face direction", err);
        }
    });

    router.register("pathfind", (ctx) => {
        const { id, from, to, size } = ctx.payload;
        const res = services.findPath({
            from,
            to,
            size: size ?? 1,
        });
        if (!res) {
            services.sendAdminResponse(
                ctx.ws,
                services.encodeMessage({
                    type: "path",
                    payload: { id, ok: false, message: "path service unavailable" },
                }),
                "admin_path_response",
            );
            return;
        }
        const t0 = Date.now();
        const dt = Date.now() - t0;
        try {
            logger.info(`pathfind request: ${dt}ms`);
        } catch (err) {
            logger.warn("Failed to log pathfind timing", err);
        }
        services.sendAdminResponse(
            ctx.ws,
            services.encodeMessage({
                type: "path",
                payload: { id, ok: res.ok, waypoints: res.waypoints, message: res.message },
            }),
            "admin_path_response",
        );
    });
}
