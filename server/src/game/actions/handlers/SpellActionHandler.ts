/**
 * Spell action execution handler.
 *
 * Handles execution of spell-related actions:
 * - processSpellCastRequest (main spell processing)
 * - handleAutocastMagicAttack (autocast combat spells)
 * - Spell payload parsing and normalization
 *
 * Uses shared ServerServices for all dependencies.
 */
import type { WebSocket } from "ws";

import { faceAngleRs } from "../../../../../src/rs/utils/rotation";
import { resolveSelectedSpellPayload } from "../../../../../src/shared/spells/selectedSpellPayload";
import { SPELL_BUTTON_PARAM_ID } from "../../../data/spellWidgetLoader";
import { logger } from "../../../utils/logger";
import type { ServerServices } from "../../ServerServices";
import { HITMARK_BLOCK, HITMARK_DAMAGE } from "../../combat/HitEffects";
import { getSpellBaseXp } from "../../combat/SpellXpProvider";
import type { ProjectileParams as CachedProjectileParams } from "../../data/ProjectileParamsProvider";
import { getProjectileParams } from "../../data/ProjectileParamsProvider";
import type { NpcState } from "../../npc";
import type { PlayerState } from "../../player";
import { SpellCaster } from "../../spells/SpellCaster";
import type {
    SpellCastOutcome,
    SpellCastContext as SpellCasterContext,
} from "../../spells/SpellCaster";
import type { SpellDataEntry as CachedSpellDataEntry } from "../../spells/SpellDataProvider";
import {
    canWeaponAutocastSpell,
    getSpellData,
    getSpellDataByWidget,
    resolveMagicCastSpotAnimHeight,
    resolveMagicImpactSpotAnimHeight,
} from "../../spells/SpellDataProvider";
import { CombatEngine } from "../../systems/combat/CombatEngine";
import { TEST_HIT_FORCE, testRandFloat } from "../../testing/TestRng";
import type { ActionRequest } from "../types";

// ============================================================================
// Types
// ============================================================================

/** Spell cast modifiers. */
export interface SpellCastModifiers {
    isAutocast?: boolean;
    defensive?: boolean;
    queued?: boolean;
    castMode?: "manual" | "autocast" | "defensive_autocast";
}

/** Spell target kinds. */
export type SpellTargetKind = "npc" | "player" | "loc" | "obj";

/** Spell cast request target. */
export type SpellCastTarget =
    | { type: "npc"; npcId: number }
    | { type: "player"; playerId: number }
    | { type: "loc"; locId: number; tile: { x: number; y: number; plane?: number } }
    | { type: "obj"; objId: number; tile: { x: number; y: number; plane?: number } };

/** Spell cast request. */
export interface SpellCastRequest {
    spellId: number;
    modifiers?: SpellCastModifiers;
    target: SpellCastTarget;
}

/** Spell result payload. */
export interface SpellResultPayload {
    casterId: number;
    spellId: number;
    outcome: "success" | "failure";
    reason?: string;
    targetType: SpellTargetKind;
    targetId?: number;
    tile?: { x: number; y: number; plane?: number };
    modifiers?: SpellCastModifiers;
    castSpotAnim?: number;
    impactSpotAnim?: number;
    splashSpotAnim?: number;
    hitDelay?: number;
    maxHit?: number;
    damage?: number;
    runesConsumed?: Array<{ itemId: number; quantity: number }>;
}

/** Spell data entry from cache. */
export type SpellDataEntry = CachedSpellDataEntry;

/** Projectile parameters. */
export type ProjectileParams = CachedProjectileParams;

/** Player attack plan for autocast. */
export interface PlayerAttackPlan {
    hitDelay: number;
}

/** Spell cast context for validation. */
export type SpellCastContext = SpellCasterContext;

/** Spell validation result. */
export type SpellValidationResult = SpellCastOutcome;

/** Spell execution result. */
export type SpellExecutionResult = SpellCastOutcome;

/** Projectile timing. */
export interface ProjectileTiming {
    startDelay: number;
    travelTime: number;
    hitDelay: number;
    lineOfSight?: boolean;
}

/** Spot animation request. */
export interface SpotAnimRequest {
    tick: number;
    playerId?: number;
    npcId?: number;
    spotId: number;
    delay?: number;
    height?: number;
}

/** Sound broadcast request. */
export interface SoundBroadcastRequest {
    soundId: number;
    x: number;
    y: number;
    level: number;
    delay?: number;
}

/** Action schedule request. */
export type SpellScheduledActionKind = "combat.playerHit";

export type ActionScheduleRequest<K extends SpellScheduledActionKind = SpellScheduledActionKind> =
    ActionRequest<K>;

/** Action schedule result. */
export interface ActionScheduleResult {
    ok: boolean;
    reason?: string;
}

/** WebSocket reference. */
export type WebSocketRef = WebSocket;

/** Base spell cast payload with common fields. */
export interface SpellCastPayloadBase {
    spellId?: number;
    spellbookGroupId?: number;
    widgetChildId?: number;
    selectedSpellWidgetId?: number;
    selectedSpellChildIndex?: number;
    selectedSpellItemId?: number;
    modifiers?: SpellCastModifiers;
}

/** Spell cast NPC payload. */
export interface SpellCastNpcPayload extends SpellCastPayloadBase {
    npcId: number;
}

/** Spell cast player payload. */
export interface SpellCastPlayerPayload extends SpellCastPayloadBase {
    playerId: number;
}

/** Spell cast loc payload. */
export interface SpellCastLocPayload extends SpellCastPayloadBase {
    locId: number;
    tile?: { x: number; y: number };
    plane?: number;
}

/** Spell cast obj payload. */
export interface SpellCastObjPayload extends SpellCastPayloadBase {
    objId: number;
    tile?: { x: number; y: number };
    plane?: number;
}

// ============================================================================
// Constants
// ============================================================================

const SkillId = {
    Magic: 6,
} as const;

// ============================================================================
// SpellActionHandler
// ============================================================================

/**
 * Handles spell action execution.
 */
export class SpellActionHandler {
    constructor(private readonly svc: ServerServices) {}

    // ========================================================================
    // Private helpers (replacing lambda services)
    // ========================================================================

    private getCurrentTick(): number {
        return this.svc.ticker.currentTick();
    }

    /** OSRS: MagicDelay = 1 + floor((1 + chebyshev distance) / 3) ticks to the hitsplat. */
    private magicHitDelayTicks(
        player: PlayerState,
        targetNpc?: NpcState,
        targetPlayer?: PlayerState,
    ): number {
        let distance = 0;
        if (targetNpc) {
            distance = this.svc.combatEffectService.getDistanceToNpcBounds(player, targetNpc);
        } else if (targetPlayer) {
            distance = Math.max(
                Math.abs(player.tileX - targetPlayer.tileX),
                Math.abs(player.tileY - targetPlayer.tileY),
            );
        }
        return 1 + Math.floor((1 + Math.max(0, distance)) / 3);
    }

    private getDeliveryTick(): number {
        return this.svc.activeFrame ? this.svc.activeFrame.tick : this.svc.ticker.currentTick() + 1;
    }

    private getCyclesPerTick(): number {
        return Math.max(1, Math.round(this.svc.tickMs / 20));
    }

    private toClientCycles(delayTicks: number): number {
        return Math.max(0, Math.min(0xffff, Math.round(delayTicks * this.getCyclesPerTick())));
    }

    private playSpellCastSound(player: PlayerState, spellId: number): void {
        const sfx = this.svc.playerCombatService!.pickSpellSound(spellId, "cast");
        if (sfx !== undefined) {
            this.svc.soundService?.sendSound(player, sfx);
        }
    }

    private getSpellBaseXpForCast(spellId: number, spellData: SpellDataEntry): number {
        if (spellData.category === "combat") {
            return Math.max(0, getSpellBaseXp(spellId));
        }
        return Math.max(0, spellData.experienceGained ?? 0);
    }

    private queueMagicCastSpot(player: PlayerState, spellData: SpellDataEntry): void {
        if (spellData.castSpotAnim === undefined || spellData.castSpotAnim < 0) return;
        this.svc.broadcastService.enqueueSpotAnimation({
            tick: this.getCurrentTick(),
            playerId: player.id,
            spotId: spellData.castSpotAnim,
            delay: 0,
            height: resolveMagicCastSpotAnimHeight(spellData),
        });
    }

    private queueMagicImpactEffects(opts: {
        player: PlayerState;
        spellData: SpellDataEntry;
        targetNpc?: NpcState;
        targetPlayer?: PlayerState;
        landed: boolean;
        delayTicks: number;
    }): void {
        const spotId = opts.landed
            ? opts.spellData.impactSpotAnim
            : (opts.spellData.splashSpotAnim ?? opts.spellData.impactSpotAnim);
        const delayCycles = this.toClientCycles(opts.delayTicks);

        if (spotId !== undefined && spotId >= 0) {
            const event = {
                tick: this.getCurrentTick(),
                spotId,
                delay: opts.delayTicks,
                height: resolveMagicImpactSpotAnimHeight(opts.landed, opts.spellData),
            };
            if (opts.targetNpc) {
                this.svc.broadcastService.enqueueSpotAnimation({
                    ...event,
                    npcId: opts.targetNpc.id,
                });
            } else if (opts.targetPlayer) {
                this.svc.broadcastService.enqueueSpotAnimation({
                    ...event,
                    playerId: opts.targetPlayer.id,
                });
            }
        }

        if (opts.targetNpc) {
            const npcCombatSeq = this.svc.combatDataService.getNpcCombatSequences(
                opts.targetNpc.typeId,
            );
            if (npcCombatSeq?.block !== undefined) {
                this.svc.combatEffectService.broadcastNpcSequence(opts.targetNpc, npcCombatSeq.block, {
                    yieldToExisting: true,
                    delayCycles,
                });
            }
        } else if (opts.targetPlayer) {
            const blockSeq = this.svc.playerCombatManager?.pickBlockSequence(
                opts.targetPlayer,
                this.svc.appearanceService.getWeaponAnimOverrides(),
            );
            if (blockSeq !== undefined && blockSeq >= 0) {
                opts.targetPlayer.queueOneShotSeq(blockSeq, delayCycles, { interruptible: true });
            }
        }

        const impactSound = this.svc.playerCombatService!.pickSpellSound(
            opts.spellData.id,
            opts.landed ? "impact" : "splash",
        );
        const soundTarget = opts.targetNpc ?? opts.targetPlayer;
        if (impactSound !== undefined && soundTarget) {
            this.svc.networkLayer.withDirectSendBypass("combat_spell_impact_sound", () =>
                this.svc.broadcastService.broadcastSound(
                    {
                        soundId: impactSound,
                        x: soundTarget.tileX,
                        y: soundTarget.tileY,
                        level: soundTarget.level,
                        loops: 1,
                        delay: delayCycles,
                        radius: 10,
                    },
                    "combat_spell_impact_sound",
                ),
            );
        }
    }

    private buildAndQueueSpellProjectileLaunch(opts: {
        player: PlayerState;
        spellData: SpellDataEntry;
        projectileDefaults?: ProjectileParams;
        targetNpc?: NpcState;
        targetPlayer?: PlayerState;
        targetTile?: { x: number; y: number; plane: number };
        timing?: ProjectileTiming;
        endHeight?: number;
    }): void {
        if (!this.svc.projectileSystem) return;
        const launch = this.svc.projectileSystem.buildSpellProjectileLaunch({
            player: opts.player,
            targetNpc: opts.targetNpc,
            targetPlayer: opts.targetPlayer,
            targetTile: opts.targetTile,
            spellData: opts.spellData,
            projectileDefaults: opts.projectileDefaults,
            endHeight: opts.endHeight,
            timing: opts.timing,
        });
        if (launch) {
            this.svc.projectileTimingService!.queueProjectileForViewers(launch);
        }
    }

    private planPlayerVsPlayerMagic(
        attacker: PlayerState,
        target: PlayerState,
    ): { hitLanded: boolean; maxHit: number; damage: number } {
        try {
            const engine = new CombatEngine();
            const res = engine.planPlayerVsPlayerMagic(attacker, target);
            return {
                hitLanded: !!res.hitLanded,
                maxHit: res.maxHit,
                damage: res.damage,
            };
        } catch {
            return { hitLanded: false, maxHit: 0, damage: 0 };
        }
    }

    private planPlayerVsNpcMagic(
        attacker: PlayerState,
        target: NpcState,
        spellId: number,
    ): { hitLanded: boolean; maxHit: number; damage: number } {
        try {
            const engine = new CombatEngine();
            const magicCaster = Object.create(attacker) as PlayerState;
            (magicCaster as unknown as { combat: typeof attacker.combat }).combat = Object.create(
                attacker.combat,
            );
            magicCaster.combat.spellId = spellId;
            magicCaster.combat.autocastEnabled = false;
            magicCaster.combat.autocastMode = null;
            (
                magicCaster as unknown as { getCurrentAttackType: () => string }
            ).getCurrentAttackType = () => "magic";
            const res = engine.planPlayerAttack({
                player: magicCaster,
                npc: target,
                attackSpeed: this.svc.playerCombatService!.pickAttackSpeed(attacker),
            });
            return {
                hitLanded: !!res.hitLanded,
                maxHit: res.maxHit,
                damage: res.damage,
            };
        } catch {
            return { hitLanded: false, maxHit: 0, damage: 0 };
        }
    }

    private beginManualNpcSpellCombat(player: PlayerState, npc: NpcState, tick: number): void {
        const attackSpeed = Math.max(1, this.svc.playerCombatService!.pickAttackSpeed(player));
        this.svc.playerCombatManager?.startCombat(player, npc, tick, attackSpeed);
        this.svc.playerCombatManager?.stopAutoAttack(player.id);
    }

    // ========================================================================
    // Public Methods
    // ========================================================================

    /**
     * Handle autocast magic attack during combat.
     * Returns true if normal attack should proceed, false if spell was cast.
     */
    handleAutocastMagicAttack(opts: {
        player: PlayerState;
        npc: NpcState;
        plan: PlayerAttackPlan;
        tick: number;
    }): boolean {
        const { player, npc, plan, tick } = opts;
        const spellId = player.combat.spellId ?? -1;
        if (!(spellId > 0)) return true;
        if (!player.combat.autocastEnabled) return true;
        if (player.combat.lastSpellCastTick >= tick) return true;

        const weaponItemId = player.combat.weaponItemId;
        const weaponCompatibility = canWeaponAutocastSpell(weaponItemId, spellId);
        if (!weaponCompatibility.compatible) {
            return true;
        }

        const spellData = getSpellData(spellId);
        if (!spellData) {
            logger.info(
                `[combat] disabling autocast (npc) for player ${player.id}: invalid spellId=${spellId}`,
            );
            this.svc.equipmentService.resetAutocast(player);
            return false;
        }

        const castContext: SpellCastContext = {
            player,
            spellId,
            targetNpc: npc,
            isAutocast: true,
        };

        const validation = SpellCaster.validate(castContext);
        if (!validation.success) {
            const castMode = player.combat.autocastMode ?? "autocast";
            logger.info(
                `[combat] disabling autocast (npc) for player ${
                    player.id
                }: spellId=${spellId} reason=${String(validation.reason ?? "unknown")}`,
            );
            this.svc.equipmentService.resetAutocast(player);
            const failurePayload: SpellResultPayload = {
                casterId: player.id,
                spellId,
                outcome: "failure",
                reason: validation.reason ?? "server_error",
                targetType: "npc",
                targetId: npc.id,
                modifiers: {
                    isAutocast: false,
                    castMode,
                },
                tile: { x: npc.tileX, y: npc.tileY, plane: npc.level },
            };
            this.svc.broadcastService.queueSpellResult(player.id, failurePayload);
            try {
                this.svc.spellCastingService!.enqueueSpellFailureChat(
                    player,
                    spellId,
                    validation.reason,
                );
            } catch (err) {
                logger.warn("[spell] failed to enqueue spell failure chat", err);
            }
            this.svc.queueCombatState(player);
            return false;
        }

        // Special targeting rules: Crumble Undead (NPC undead only)
        if (spellId === 3293) {
            try {
                const npcType = this.svc.npcManager?.getNpcType(npc);
                const name = (npcType?.name || npc.name || "").toLowerCase();
                const isUndead = /(skeleton|zombie|ghost)/.test(name);
                if (!isUndead) {
                    const failurePayload: SpellResultPayload = {
                        casterId: player.id,
                        spellId,
                        outcome: "failure",
                        reason: "immune_target",
                        targetType: "npc",
                        targetId: npc.id,
                        tile: { x: npc.tileX, y: npc.tileY, plane: npc.level },
                        modifiers: {
                            isAutocast: true,
                            castMode: player.combat.autocastMode ?? "autocast",
                        },
                    };
                    this.svc.broadcastService.queueSpellResult(player.id, failurePayload);
                    try {
                        this.svc.spellCastingService!.enqueueSpellFailureChat(
                            player,
                            spellId,
                            "immune_target",
                        );
                    } catch (err) {
                        logger.warn("[spell] failed to enqueue immune target chat", err);
                    }
                    return false;
                }
            } catch (err) {
                logger.warn("[spell] failed to check crumble undead targeting", err);
            }
        }

        const execution = SpellCaster.execute(castContext, validation);

        const projectileDefaults =
            spellData.projectileId !== undefined
                ? getProjectileParams(spellData.projectileId)
                : undefined;
        const targetEndHeight = this.svc.projectileTimingService!.computeProjectileEndHeight({
            projectileDefaults,
            spellData,
            targetNpc: npc,
        });

        const targetTileX = npc.tileX;
        const targetTileY = npc.tileY;

        const timing = this.svc.projectileTimingService!.estimateProjectileTiming({
            player,
            targetX: targetTileX,
            targetY: targetTileY,
            projectileDefaults,
            spellData,
        });

        const payload: SpellResultPayload = {
            casterId: player.id,
            spellId,
            outcome: "success",
            targetType: "npc",
            targetId: npc.id,
            modifiers: {
                isAutocast: true,
                castMode: player.combat.autocastMode ?? "autocast",
            },
            tile: { x: targetTileX, y: targetTileY, plane: npc.level },
            castSpotAnim: spellData.castSpotAnim !== undefined ? spellData.castSpotAnim : undefined,
            impactSpotAnim:
                spellData.impactSpotAnim !== undefined ? spellData.impactSpotAnim : undefined,
            splashSpotAnim:
                spellData.splashSpotAnim !== undefined ? spellData.splashSpotAnim : undefined,
            hitDelay: timing ? timing.startDelay + timing.travelTime : undefined,
            runesConsumed: execution.runesConsumed
                ? execution.runesConsumed.map((entry) => ({
                      itemId: entry.itemId,
                      quantity: entry.quantity,
                  }))
                : undefined,
        };

        // Award base Magic XP on cast
        try {
            const xp = this.getSpellBaseXpForCast(spellId, spellData);
            if (xp > 0) {
                this.svc.skillService.awardSkillXp(player, SkillId.Magic, xp);
            }
        } catch (err) {
            logger.warn("[spell] failed to award autocast xp", err);
        }

        const sock = this.svc.players?.getSocketByPlayerId(player.id);
        if (sock) {
            this.svc.inventoryService.sendInventorySnapshot(sock, player);
        }

        this.svc.broadcastService.queueSpellResult(player.id, payload);

        // Face the NPC and queue attack animation
        try {
            try {
                const dxWorld = player.x - npc.x;
                const dyWorld = player.y - npc.y;
                if (dxWorld !== 0 || dyWorld !== 0) {
                    player.setForcedOrientation(faceAngleRs(player.x, player.y, npc.x, npc.y));
                    player._pendingFace = { x: npc.x, y: npc.y };
                    player.pendingFaceTile = { x: npc.tileX, y: npc.tileY };
                    player.markSent();
                }
            } catch (err) {
                logger.warn("[spell] failed to face npc for autocast", err);
            }
            const attackSeq = this.svc.playerCombatService!.pickSpellCastSequence(
                player,
                spellId,
                true,
            );
            if (attackSeq >= 0) {
                player.queueOneShotSeq(attackSeq, 0);
            }
        } catch (err) {
            logger.warn("[spell] failed to queue autocast animation", err);
        }

        player.combat.lastSpellCastTick = tick;

        // Queue projectile for viewers
        this.buildAndQueueSpellProjectileLaunch({
            player,
            spellData,
            projectileDefaults,
            targetNpc: npc,
            timing,
            endHeight: targetEndHeight,
        });

        const totalHitDelay = timing ? timing.startDelay + timing.travelTime : undefined;

        // Broadcast cast spot, cast sound, and delayed impact effects.
        try {
            if (timing) {
                this.queueMagicCastSpot(player, spellData);
                this.playSpellCastSound(player, spellId);
                this.queueMagicImpactEffects({
                    player,
                    spellData,
                    targetNpc: npc,
                    landed: !!(plan as PlayerAttackPlan & { hitLanded?: boolean }).hitLanded,
                    delayTicks: timing.hitDelay,
                });
            }
        } catch (err) {
            logger.warn("[spell] failed to queue autocast sound", err);
        }

        if (Number.isFinite(totalHitDelay as number) && (totalHitDelay as number) > plan.hitDelay) {
            plan.hitDelay = totalHitDelay as number;
        }

        return true;
    }

    /**
     * Normalize spell modifiers from raw payload.
     */
    normalizeSpellModifiers(raw: SpellCastPayloadBase): SpellCastModifiers | undefined {
        const source = raw.modifiers;
        if (!source) return undefined;
        const modifiers: SpellCastModifiers = {};
        let hasAny = false;
        if (source.isAutocast !== undefined) {
            modifiers.isAutocast = source.isAutocast;
            hasAny = true;
        }
        if (source.defensive !== undefined) {
            modifiers.defensive = source.defensive;
            hasAny = true;
        }
        if (source.queued !== undefined) {
            modifiers.queued = source.queued;
            hasAny = true;
        }
        const modeRaw = source.castMode;
        if (modeRaw === "manual" || modeRaw === "autocast" || modeRaw === "defensive_autocast") {
            modifiers.castMode = modeRaw;
            hasAny = true;
        }
        if (!hasAny) return undefined;
        if (!modifiers.castMode) {
            if (modifiers.isAutocast) {
                modifiers.castMode = modifiers.defensive ? "defensive_autocast" : "autocast";
            } else {
                modifiers.castMode = "manual";
            }
        }
        return modifiers;
    }

    /**
     * Normalize spell tile from raw payload.
     */
    normalizeSpellTile(
        tileRaw: { x: number; y: number } | undefined,
        planeRaw?: number,
    ): { x: number; y: number; plane?: number } | undefined {
        if (!tileRaw) return undefined;
        const tile: { x: number; y: number; plane?: number } = {
            x: tileRaw.x,
            y: tileRaw.y,
        };
        if (planeRaw !== undefined) tile.plane = planeRaw;
        return tile;
    }

    private resolveSpellWidgetFromObject(
        itemId: number | undefined,
    ): { groupId: number; childId: number } | undefined {
        if (typeof itemId !== "number" || (itemId | 0) <= 0) return undefined;
        const objType = this.svc.dataLoaderService.getObjType(itemId | 0) as any;
        const componentHash = objType?.params?.get?.(SPELL_BUTTON_PARAM_ID);
        if (typeof componentHash !== "number" || (componentHash | 0) <= 0) {
            return undefined;
        }
        return {
            groupId: (componentHash >>> 16) & 0xffff,
            childId: componentHash & 0xffff,
        };
    }

    /**
     * Parse spell cast payload from message.
     */
    parseSpellCastPayload(
        player: PlayerState,
        raw:
            | SpellCastNpcPayload
            | SpellCastPlayerPayload
            | SpellCastLocPayload
            | SpellCastObjPayload,
        kind: SpellTargetKind,
    ): { ok: true; request: SpellCastRequest } | { ok: false; result: SpellResultPayload } {
        const modifiers = this.normalizeSpellModifiers(raw);

        let spellData: SpellDataEntry | undefined;
        let spellId: number;

        const resolvedSelection = resolveSelectedSpellPayload(raw);
        const objectSpellWidget = this.resolveSpellWidgetFromObject(
            resolvedSelection.selectedSpellItemId,
        );
        const spellbookGroupId = objectSpellWidget?.groupId ?? resolvedSelection.spellbookGroupId;
        const widgetChildId = resolvedSelection.widgetChildId;
        const selectedSpellWidgetId = resolvedSelection.selectedSpellWidgetId;
        const selectedComponentChildId =
            selectedSpellWidgetId !== undefined ? selectedSpellWidgetId & 0xffff : undefined;

        if (spellbookGroupId !== undefined) {
            const childCandidates: number[] = [];
            if (objectSpellWidget && objectSpellWidget.childId > 0) {
                childCandidates.push(objectSpellWidget.childId);
            }
            if (selectedComponentChildId !== undefined && selectedComponentChildId > 0) {
                if (!childCandidates.includes(selectedComponentChildId)) {
                    childCandidates.push(selectedComponentChildId);
                }
            }
            if (widgetChildId !== undefined && !childCandidates.includes(widgetChildId)) {
                childCandidates.push(widgetChildId);
            }
            for (const childCandidate of childCandidates) {
                spellData = getSpellDataByWidget(spellbookGroupId, childCandidate);
                if (spellData) break;
            }
            spellId = spellData?.id ?? -1;
            logger.info(
                `[spell] Widget lookup: group=${spellbookGroupId}, children=${childCandidates.join(
                    ",",
                )} -> spellId=${spellId}, name=${
                    spellData?.name ?? "unknown"
                }, projectileId=${spellData?.projectileId ?? "none"}`,
            );
        } else {
            spellId = raw.spellId ?? -1;
            spellData = spellId > 0 ? getSpellData(spellId) : undefined;
        }

        const baseResult: SpellResultPayload = {
            casterId: player.id,
            spellId: spellId > 0 ? spellId : 0,
            outcome: "failure",
            targetType: kind,
            modifiers,
        };

        if (!(spellId > 0) || !spellData) {
            baseResult.reason = "invalid_spell";
            logger.warn(`[spell] Validation failed for spell=${spellId}: invalid_spell`);
            return { ok: false, result: baseResult };
        }

        switch (kind) {
            case "npc": {
                const npcId = (raw as SpellCastNpcPayload).npcId;
                baseResult.targetId = npcId >= 0 ? npcId : undefined;
                if (!(npcId >= 0)) {
                    baseResult.reason = "invalid_target";
                    return { ok: false, result: baseResult };
                }
                return {
                    ok: true,
                    request: {
                        spellId: spellId,
                        modifiers,
                        target: { type: "npc", npcId: npcId },
                    },
                };
            }
            case "player": {
                const playerId = (raw as SpellCastPlayerPayload).playerId;
                baseResult.targetId = playerId >= 0 ? playerId : undefined;
                if (!(playerId >= 0)) {
                    baseResult.reason = "invalid_target";
                    return { ok: false, result: baseResult };
                }
                return {
                    ok: true,
                    request: {
                        spellId: spellId,
                        modifiers,
                        target: { type: "player", playerId: playerId },
                    },
                };
            }
            case "loc": {
                const locPayload = raw as SpellCastLocPayload;
                const locId = locPayload.locId;
                const tile = this.normalizeSpellTile(locPayload.tile, locPayload.plane);
                baseResult.targetId = locId > 0 ? locId : undefined;
                baseResult.tile = tile ? { ...tile } : undefined;
                if (!(locId > 0 && tile)) {
                    baseResult.reason = "invalid_target";
                    return { ok: false, result: baseResult };
                }
                return {
                    ok: true,
                    request: {
                        spellId: spellId,
                        modifiers,
                        target: { type: "loc", locId: locId, tile },
                    },
                };
            }
            case "obj": {
                const objPayload = raw as SpellCastObjPayload;
                const objId = objPayload.objId;
                const tile = this.normalizeSpellTile(objPayload.tile, objPayload.plane);
                baseResult.targetId = objId > 0 ? objId : undefined;
                baseResult.tile = tile ? { ...tile } : undefined;
                if (!(objId > 0 && tile)) {
                    baseResult.reason = "invalid_target";
                    return { ok: false, result: baseResult };
                }
                return {
                    ok: true,
                    request: {
                        spellId: spellId,
                        modifiers,
                        target: { type: "obj", objId: objId, tile },
                    },
                };
            }
        }
    }

    /**
     * Process spell cast request.
     */
    processSpellCastRequest(
        player: PlayerState,
        request: SpellCastRequest,
        tick: number,
    ): SpellResultPayload {
        const spellId = request.spellId;
        const base: SpellResultPayload = {
            casterId: player.id,
            spellId,
            outcome: "failure",
            reason: "server_error",
            targetType: request.target.type,
            modifiers: request.modifiers,
        };

        switch (request.target.type) {
            case "npc":
                base.targetId = request.target.npcId;
                break;
            case "player":
                base.targetId = request.target.playerId;
                break;
            case "loc":
                base.targetId = request.target.locId;
                base.tile = { ...request.target.tile };
                break;
            case "obj":
                base.targetId = request.target.objId;
                base.tile = { ...request.target.tile };
                break;
        }

        let targetNpc: NpcState | undefined;
        let targetPlayer: PlayerState | undefined;
        let targetTile: { x: number; y: number; plane: number } | undefined;

        if (request.target.type === "npc") {
            const npc = this.svc.npcManager?.getById(request.target.npcId);
            if (!npc) {
                base.reason = "invalid_target";
                return base;
            }
            if (npc.level !== player.level) {
                base.reason = "out_of_range";
                return base;
            }
            targetNpc = npc;
            targetTile = { x: npc.tileX, y: npc.tileY, plane: npc.level };
        } else if (request.target.type === "player") {
            logger.info(`[spell] Looking up player target: ${request.target.playerId}`);
            const opponent = this.svc.players?.getById(request.target.playerId);
            if (!opponent) {
                logger.warn(`[spell] Target player ${request.target.playerId} not found`);
                base.reason = "invalid_target";
                return base;
            }
            logger.info(`[spell] Found target player: id=${opponent.id}, name=${opponent.name}`);
            if (opponent.id === player.id) {
                logger.warn(`[spell] Cannot target self`);
                base.reason = "invalid_target";
                return base;
            }
            if (opponent.level !== player.level) {
                logger.warn(
                    `[spell] Target on different level: caster=${player.level}, target=${opponent.level}`,
                );
                base.reason = "out_of_range";
                return base;
            }
            targetPlayer = opponent;
            targetTile = {
                x: opponent.tileX,
                y: opponent.tileY,
                plane: opponent.level,
            };
            base.tile = { ...targetTile };
        } else {
            base.reason = "invalid_target";
            return base;
        }

        const explicitAutocast =
            request.modifiers?.isAutocast === true ||
            request.modifiers?.castMode === "autocast" ||
            request.modifiers?.castMode === "defensive_autocast";
        const implicitAutocast =
            !request.modifiers &&
            player.combat.autocastEnabled &&
            player.combat.spellId === spellId;
        const isAutocast = explicitAutocast || implicitAutocast;

        const castContext: SpellCastContext = {
            player,
            spellId,
            targetNpc,
            targetPlayer,
            isAutocast,
        };

        const validation = SpellCaster.validate(castContext);
        if (!validation.success) {
            base.reason = validation.reason ?? "server_error";
            try {
                this.svc.spellCastingService!.enqueueSpellFailureChat(
                    player,
                    spellId,
                    validation.reason,
                );
            } catch (err) {
                logger.warn("[spell] failed to enqueue spell failure chat", err);
            }
            return base;
        }

        const spellData = getSpellData(spellId);
        if (!spellData) {
            base.reason = "invalid_spell";
            return base;
        }

        const execution = SpellCaster.execute(castContext, validation);

        // Award base Magic XP
        try {
            const xp = this.getSpellBaseXpForCast(spellId, spellData);
            if (xp > 0) {
                this.svc.skillService.awardSkillXp(player, SkillId.Magic, xp);
            }
        } catch (err) {
            logger.warn("[spell] failed to award spell xp", err);
        }

        // Store pending player damage for scheduling
        if (targetPlayer) {
            player.combat.pendingPlayerSpellDamage = {
                targetId: targetPlayer.id,
            };
        }

        player.combat.lastSpellCastTick = tick;

        const sock = this.svc.players?.getSocketByPlayerId(player.id);
        if (!sock) {
            base.reason = "server_error";
            return base;
        }

        // Manual spell casts are one-shot actions and should replace any active click intent
        // so stale weapon auto-attack loops do not immediately override the cast.
        try {
            if (!isAutocast) {
                this.svc.players?.clearAllInteractions(sock);
                this.svc.actionScheduler.clearActionsInGroup(player.id, "combat.attack");
                this.svc.actionScheduler.clearActionsInGroup(player.id, "combat.autocast");
            }
        } catch (err) {
            logger.warn("[spell] failed to clear interactions after manual cast", err);
        }

        // combat spells cast on NPCs enter the normal combat loop so the NPC can
        // retaliate on-hit, but manual spellbook casts remain one-shot and must not auto-repeat.
        if (targetNpc && !isAutocast) {
            this.beginManualNpcSpellCombat(player, targetNpc, tick);
        }

        // Face target and queue animation
        try {
            if (targetNpc) {
                const dx = player.x - targetNpc.x;
                const dy = player.y - targetNpc.y;
                if (dx !== 0 || dy !== 0) {
                    player.setForcedOrientation(
                        faceAngleRs(player.x, player.y, targetNpc.x, targetNpc.y),
                    );
                    player._pendingFace = { x: targetNpc.x, y: targetNpc.y };
                    player.pendingFaceTile = { x: targetNpc.tileX, y: targetNpc.tileY };
                    player.markSent();
                }
            } else if (targetPlayer) {
                const dx = player.x - targetPlayer.x;
                const dy = player.y - targetPlayer.y;
                if (dx !== 0 || dy !== 0) {
                    player.setForcedOrientation(
                        faceAngleRs(player.x, player.y, targetPlayer.x, targetPlayer.y),
                    );
                    player._pendingFace = { x: targetPlayer.x, y: targetPlayer.y };
                    player.pendingFaceTile = {
                        x: targetPlayer.tileX,
                        y: targetPlayer.tileY,
                    };
                    player.markSent();
                }
            }
            const attackSeq = this.svc.playerCombatService!.pickSpellCastSequence(
                player,
                spellId,
                isAutocast,
            );
            if (attackSeq >= 0) {
                player.queueOneShotSeq(attackSeq, 0);
            }
        } catch (err) {
            logger.warn("[spell] failed to queue spell cast animation", err);
        }

        if (spellData.castSpotAnim !== undefined) base.castSpotAnim = spellData.castSpotAnim;
        if (spellData.impactSpotAnim !== undefined) base.impactSpotAnim = spellData.impactSpotAnim;
        if (spellData.splashSpotAnim !== undefined) base.splashSpotAnim = spellData.splashSpotAnim;

        const projectileDefaults =
            spellData.projectileId !== undefined
                ? getProjectileParams(spellData.projectileId)
                : undefined;
        const resolvedTile = targetTile ?? base.tile;

        const targetEndHeight = this.svc.projectileTimingService!.computeProjectileEndHeight({
            projectileDefaults,
            spellData,
            targetPlayer,
            targetNpc,
        });

        const deliveryTick = Math.max(tick, this.getDeliveryTick());

        const timing = this.svc.projectileTimingService!.estimateProjectileTiming({
            player,
            targetX: resolvedTile?.x,
            targetY: resolvedTile?.y,
            projectileDefaults,
            spellData,
        });
        base.maxHit = spellData.baseMaxHit;
        base.hitDelay = timing ? timing.startDelay + timing.travelTime : undefined;

        // Queue projectile for viewers
        if (spellData.projectileId !== undefined) {
            this.buildAndQueueSpellProjectileLaunch({
                player,
                spellData,
                projectileDefaults,
                targetNpc,
                targetPlayer,
                targetTile: resolvedTile
                    ? {
                          x: resolvedTile.x,
                          y: resolvedTile.y,
                          plane: resolvedTile.plane ?? player.level,
                      }
                    : undefined,
                timing,
                endHeight: targetEndHeight,
            });
        }

        if (timing) {
            this.queueMagicCastSpot(player, spellData);
            this.playSpellCastSound(player, spellId);
        }

        // Schedule damage for NPC target. The hit tick comes from the OSRS magic
        // hit-delay formula; the projectile visuals run on their own cycle timing.
        if (targetNpc && timing) {
            const impactDelay = this.magicHitDelayTicks(player, targetNpc);
            const currentTick = deliveryTick;
            let outcome: { landed: boolean; maxHit: number; damage: number };
            if (TEST_HIT_FORCE !== undefined && TEST_HIT_FORCE >= 0) {
                outcome = {
                    landed: true,
                    maxHit: spellData.baseMaxHit ?? 0,
                    damage: Math.max(0, Math.min(spellData.baseMaxHit ?? 0, TEST_HIT_FORCE)),
                };
            } else {
                try {
                    const res = this.planPlayerVsNpcMagic(player, targetNpc, spellId);
                    outcome = {
                        landed: !!res.hitLanded,
                        maxHit: Math.max(0, res.maxHit),
                        damage: Math.max(0, res.damage),
                    };
                } catch {
                    const damage = Math.floor(testRandFloat() * ((spellData.baseMaxHit ?? 0) + 1));
                    outcome = {
                        landed: damage > 0,
                        maxHit: spellData.baseMaxHit ?? 0,
                        damage,
                    };
                }
            }
            this.queueMagicImpactEffects({
                player,
                spellData,
                targetNpc,
                landed: !!outcome.landed,
                delayTicks: timing.hitDelay,
            });
            try {
                this.svc.actionScheduler.requestAction(
                    player.id,
                    {
                        kind: "combat.playerHit",
                        data: {
                            npcId: targetNpc.id,
                            spellId: spellId,
                            damage: outcome.damage,
                            maxHit: outcome.maxHit,
                            style: outcome.landed ? HITMARK_DAMAGE : HITMARK_BLOCK,
                            attackDelay: this.svc.playerCombatService!.pickAttackSpeed(player),
                            hitDelay: impactDelay,
                            retaliationDelay: 0,
                            expectedHitTick: currentTick + impactDelay,
                            attackType: "magic",
                            landed: !!outcome.landed,
                            spellBaseXpAtCast: spellData.category === "combat",
                            magicImpactEffectsScheduled: true,
                        },
                        groups: ["combat.hit"],
                        cooldownTicks: 0,
                        delayTicks: impactDelay,
                    },
                    currentTick,
                );
            } catch (err) {
                logger.warn("[spell] failed to schedule npc magic hit", err);
            }
        }

        if (execution.runesConsumed && execution.runesConsumed.length > 0) {
            base.runesConsumed = execution.runesConsumed.map((r) => ({
                itemId: r.itemId,
                quantity: r.quantity,
            }));
        }

        // Schedule player damage if targeting a player
        const pendingDamage = player.combat.pendingPlayerSpellDamage;
        if (pendingDamage && targetPlayer && timing) {
            player.combat.pendingPlayerSpellDamage = undefined;
            const currentTick = deliveryTick;
            targetPlayer.refreshActiveCombatTimer();
            let outcome: { landed: boolean; maxHit: number; damage: number };
            try {
                const res = this.planPlayerVsPlayerMagic(player, targetPlayer);
                outcome = {
                    landed: !!res.hitLanded,
                    maxHit: res.maxHit,
                    damage: res.damage,
                };
            } catch {
                const dmg = Math.floor(testRandFloat() * ((spellData.baseMaxHit ?? 0) + 1));
                outcome = { landed: dmg > 0, maxHit: spellData.baseMaxHit ?? 0, damage: dmg };
            }

            const hitDelayTicks = this.magicHitDelayTicks(player, undefined, targetPlayer);
            const expectedHitTick = currentTick + hitDelayTicks;
            this.queueMagicImpactEffects({
                player,
                spellData,
                targetPlayer,
                landed: !!outcome.landed,
                delayTicks: timing.hitDelay,
            });
            this.svc.actionScheduler.requestAction(
                player.id,
                {
                    kind: "combat.playerHit",
                    data: {
                        targetId: pendingDamage.targetId,
                        spellId: spellId,
                        damage: outcome.damage,
                        maxHit: outcome.maxHit,
                        style: outcome.landed ? HITMARK_DAMAGE : HITMARK_BLOCK,
                        expectedHitTick,
                        landed: !!outcome.landed,
                        attackType: "magic",
                        spellBaseXpAtCast: spellData.category === "combat",
                        magicImpactEffectsScheduled: true,
                    },
                    groups: ["combat.hit"],
                    cooldownTicks: 0,
                    delayTicks: hitDelayTicks,
                },
                currentTick,
            );
        }

        this.svc.inventoryService.sendInventorySnapshot(sock, player);

        base.outcome = "success";
        base.reason = undefined;
        base.damage = pendingDamage ? undefined : base.damage;
        return base;
    }

    /**
     * Handle spell cast message from client.
     */
    handleSpellCastMessage(
        ws: WebSocketRef,
        player: PlayerState,
        raw:
            | SpellCastNpcPayload
            | SpellCastPlayerPayload
            | SpellCastLocPayload
            | SpellCastObjPayload,
        kind: SpellTargetKind,
        tick: number,
    ): void {
        // Block spell casting during tutorial
        if (!player.canInteract()) {
            return;
        }

        try {
            const parsed = this.parseSpellCastPayload(player, raw, kind);
            if (parsed.ok) {
                const outcome = this.processSpellCastRequest(player, parsed.request, tick);
                this.svc.broadcastService.queueSpellResult(player.id, outcome);
            } else {
                this.svc.broadcastService.queueSpellResult(player.id, parsed.result);
            }
        } catch (err) {
            logger.warn(`[combat] spell_cast_${kind} handling failed`, err);
            const fallback: SpellResultPayload = {
                casterId: player.id,
                spellId: raw.spellId ?? 0,
                outcome: "failure",
                reason: "server_error",
                targetType: kind,
                modifiers: this.normalizeSpellModifiers(raw),
            };
            if (kind === "npc") {
                const npcPayload = raw as SpellCastNpcPayload;
                fallback.targetId = npcPayload.npcId;
            } else if (kind === "player") {
                const playerPayload = raw as SpellCastPlayerPayload;
                fallback.targetId = playerPayload.playerId;
            } else if (kind === "loc") {
                const locPayload = raw as SpellCastLocPayload;
                fallback.targetId = locPayload.locId;
                const tile = this.normalizeSpellTile(locPayload.tile, locPayload.plane);
                if (tile) fallback.tile = tile;
            } else if (kind === "obj") {
                const objPayload = raw as SpellCastObjPayload;
                fallback.targetId = objPayload.objId;
                const tile = this.normalizeSpellTile(objPayload.tile, objPayload.plane);
                if (tile) fallback.tile = tile;
            }
            this.svc.broadcastService.queueSpellResult(player.id, fallback);
        }
    }
}
