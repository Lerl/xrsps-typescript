import type { WebSocket } from "ws";

import {
    MUSIC_UNLOCK_VARPS,
    VARBIT_ACTIVE_SPELLBOOK,
    VARBIT_AUTOCAST_DEFMODE,
    VARBIT_AUTOCAST_SET,
    VARBIT_AUTOCAST_SPELL,
    VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE,
    VARBIT_XPDROPS_ENABLED,
    VARP_AREA_SOUNDS_VOLUME,
    VARP_ATTACK_STYLE,
    VARP_AUTO_RETALIATE,
    VARP_COMBAT_TARGET_PLAYER_INDEX,
    VARP_LAST_HOME_TELEPORT,
    VARP_LAST_MINIGAME_TELEPORT,
    VARP_MASTER_VOLUME,
    VARP_MUSICPLAY,
    VARP_MUSIC_CURRENT_TRACK,
    VARP_MUSIC_VOLUME,
    VARP_OPTION_ATTACK_PRIORITY_NPC,
    VARP_OPTION_ATTACK_PRIORITY_PLAYER,
    VARP_OPTION_RUN,
    VARP_SOUND_EFFECTS_VOLUME,
    VARP_SPECIAL_ATTACK,
    XPDROPS_TRANSMIT_VARPS,
} from "../../../../src/shared/vars";
import { encodeMessage } from "../../network/messages";
import type { ServerServices } from "../ServerServices";
import type { PlayerState } from "../player";

export class VarpSyncService {
    constructor(private readonly services: ServerServices) {}

    syncMusicUnlockVarps(player: PlayerState, trackId: number): void {
        this.services.soundManager!.syncMusicUnlockVarps(player, trackId);
    }

    getCombatTargetPlayerVarpValue(player: PlayerState): number {
        const target = player.combat.getCombatTarget();
        if (!target || !target.isPlayer) {
            return -1;
        }
        return target.id & 0x7ff;
    }

    syncCombatTargetPlayerVarp(player: PlayerState): void {
        const nextValue = this.getCombatTargetPlayerVarpValue(player);
        if ((player.varps.getVarpValue(VARP_COMBAT_TARGET_PLAYER_INDEX) | 0) === (nextValue | 0)) {
            return;
        }

        player.varps.setVarpValue(VARP_COMBAT_TARGET_PLAYER_INDEX, nextValue);
        this.services.variableService.queueVarp(
            player.id,
            VARP_COMBAT_TARGET_PLAYER_INDEX,
            nextValue,
        );
    }

    syncAccountTypeVarbit(sock: WebSocket, player: PlayerState): void {
        this.services.authService.syncAccountTypeVarbit(player, (varbitId, value) => {
            this.services.networkLayer.withDirectSendBypass("varbit", () =>
                this.services.networkLayer.sendWithGuard(
                    sock,
                    encodeMessage({
                        type: "varbit",
                        payload: { varbitId, value },
                    }),
                    "varbit",
                ),
            );
        });
    }

    sendSavedAutocastTransmitVarbits(sock: WebSocket, player: PlayerState): void {
        const autocastVarbits = [
            VARBIT_AUTOCAST_SET,
            VARBIT_AUTOCAST_SPELL,
            VARBIT_AUTOCAST_DEFMODE,
        ] as const;
        for (const varbitId of autocastVarbits) {
            const value = player.varps.getVarbitValue(varbitId);
            this.services.networkLayer.withDirectSendBypass("varbit", () =>
                this.services.networkLayer.sendWithGuard(
                    sock,
                    encodeMessage({
                        type: "varbit",
                        payload: { varbitId, value },
                    }),
                    "varbit",
                ),
            );
        }
    }

    sendSavedSpellbookState(sock: WebSocket, player: PlayerState): void {
        const spellbook = player.varps.getVarbitValue(VARBIT_ACTIVE_SPELLBOOK);
        if (spellbook === 0) return;

        this.services.networkLayer.withDirectSendBypass("varbit", () =>
            this.services.networkLayer.sendWithGuard(
                sock,
                encodeMessage({
                    type: "varbit",
                    payload: { varbitId: VARBIT_ACTIVE_SPELLBOOK, value: spellbook },
                }),
                "varbit",
            ),
        );

        const SCRIPT_MAGIC_SPELLBOOK_REDRAW = 2610;
        const SPELLBOOK_REDRAW_ARGS: (number | string)[] = [
            14286851,
            14287045,
            14287054,
            14286849,
            14287051,
            14287052,
            14287053,
            14286850,
            14287047,
            14287050,
            0,
            "Info",
            "Filters",
        ];
        this.services.queueWidgetEvent(player.id, {
            action: "run_script",
            scriptId: SCRIPT_MAGIC_SPELLBOOK_REDRAW,
            args: SPELLBOOK_REDRAW_ARGS,
            varbits: { [VARBIT_ACTIVE_SPELLBOOK]: spellbook },
        });
    }

    sendSavedTransmitVarps(sock: WebSocket, player: PlayerState): void {
        const transmitVarpIds = [
            VARP_OPTION_RUN,
            VARP_ATTACK_STYLE,
            VARP_AUTO_RETALIATE,
            VARP_SPECIAL_ATTACK,
        ];
        for (const varpId of transmitVarpIds) {
            let value = player.varps.getVarpValue(varpId);

            if (varpId === VARP_AUTO_RETALIATE) {
                value = player.combat.autoRetaliate ? 0 : 1;
                player.varps.setVarpValue(VARP_AUTO_RETALIATE, value);
            }

            if (varpId === VARP_OPTION_RUN) {
                value = player.energy.wantsToRun() ? 1 : 0;
                player.varps.setVarpValue(VARP_OPTION_RUN, value);
            }

            if (varpId === VARP_OPTION_RUN || varpId === VARP_AUTO_RETALIATE || value !== 0) {
                this.services.networkLayer.withDirectSendBypass("varp", () =>
                    this.services.networkLayer.sendWithGuard(
                        sock,
                        encodeMessage({
                            type: "varp",
                            payload: { varpId, value },
                        }),
                        "varp",
                    ),
                );
            }
        }

        for (const varpId of XPDROPS_TRANSMIT_VARPS) {
            const value = player.varps.getVarpValue(varpId);
            if (value === 0) continue;
            this.services.networkLayer.withDirectSendBypass("varp", () =>
                this.services.networkLayer.sendWithGuard(
                    sock,
                    encodeMessage({
                        type: "varp",
                        payload: { varpId, value },
                    }),
                    "varp",
                ),
            );
        }

        // Apply gamemode login varp defaults (volume, music track, etc.)
        const loginVarps = player.gamemode.getLoginVarps?.(player);
        if (loginVarps) {
            for (const [varpId, value] of loginVarps) {
                if (!player.varps.hasVarpValue(varpId)) {
                    player.varps.setVarpValue(varpId, value);
                }
            }
        }
        // Replay all persisted varps/varbits (quest stages, spell unlocks, etc.)
        // so saved progression reaches the client without per-feature lists.
        // Computed/forced varps (combat target, home teleport cooldowns) are
        // sent after this and override the stored values.
        for (const [varpId, value] of player.varps.getVarpEntries()) {
            if (value === 0) continue;
            this.services.networkLayer.withDirectSendBypass("varp", () =>
                this.services.networkLayer.sendWithGuard(
                    sock,
                    encodeMessage({
                        type: "varp",
                        payload: { varpId, value },
                    }),
                    "varp",
                ),
            );
        }
        for (const [varbitId, value] of player.varps.getVarbitEntries()) {
            if (value === 0) continue;
            this.services.networkLayer.withDirectSendBypass("varbit", () =>
                this.services.networkLayer.sendWithGuard(
                    sock,
                    encodeMessage({
                        type: "varbit",
                        payload: { varbitId, value },
                    }),
                    "varbit",
                ),
            );
        }

        const soundVarps = [
            VARP_MUSIC_VOLUME,
            VARP_SOUND_EFFECTS_VOLUME,
            VARP_AREA_SOUNDS_VOLUME,
            VARP_MASTER_VOLUME,
            VARP_MUSICPLAY,
            VARP_MUSIC_CURRENT_TRACK,
        ];
        for (const varpId of soundVarps) {
            const value = player.varps.getVarpValue(varpId);
            this.services.networkLayer.withDirectSendBypass("varp", () =>
                this.services.networkLayer.sendWithGuard(
                    sock,
                    encodeMessage({
                        type: "varp",
                        payload: { varpId, value },
                    }),
                    "varp",
                ),
            );
        }

        const attackOptionVarps = [
            VARP_OPTION_ATTACK_PRIORITY_PLAYER,
            VARP_OPTION_ATTACK_PRIORITY_NPC,
        ];
        for (const varpId of attackOptionVarps) {
            const value = player.varps.getVarpValue(varpId);
            this.services.networkLayer.withDirectSendBypass("varp", () =>
                this.services.networkLayer.sendWithGuard(
                    sock,
                    encodeMessage({
                        type: "varp",
                        payload: { varpId, value },
                    }),
                    "varp",
                ),
            );
        }

        const combatTargetPlayerIndex = this.getCombatTargetPlayerVarpValue(player);
        player.varps.setVarpValue(VARP_COMBAT_TARGET_PLAYER_INDEX, combatTargetPlayerIndex);
        this.services.networkLayer.withDirectSendBypass("varp", () =>
            this.services.networkLayer.sendWithGuard(
                sock,
                encodeMessage({
                    type: "varp",
                    payload: {
                        varpId: VARP_COMBAT_TARGET_PLAYER_INDEX,
                        value: combatTargetPlayerIndex,
                    },
                }),
                "varp",
            ),
        );

        this.services.networkLayer.withDirectSendBypass("varp", () =>
            this.services.networkLayer.sendWithGuard(
                sock,
                encodeMessage({
                    type: "varp",
                    payload: { varpId: VARP_LAST_HOME_TELEPORT, value: -100000 },
                }),
                "varp",
            ),
        );

        this.services.networkLayer.withDirectSendBypass("varp", () =>
            this.services.networkLayer.sendWithGuard(
                sock,
                encodeMessage({
                    type: "varp",
                    payload: { varpId: VARP_LAST_MINIGAME_TELEPORT, value: -100000 },
                }),
                "varp",
            ),
        );

        for (const varpId of MUSIC_UNLOCK_VARPS) {
            const value = player.varps.getVarpValue(varpId);
            if (value !== 0) {
                this.services.networkLayer.withDirectSendBypass("varp", () =>
                    this.services.networkLayer.sendWithGuard(
                        sock,
                        encodeMessage({
                            type: "varp",
                            payload: { varpId, value },
                        }),
                        "varp",
                    ),
                );
            }
        }

        if (this.services.musicUnlockService) {
            this.services.musicUnlockService.initializeDefaults(player);
        }
        const musicUnlockMsgValue = player.varps.getVarbitValue(VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE);
        this.services.networkLayer.withDirectSendBypass("varbit", () =>
            this.services.networkLayer.sendWithGuard(
                sock,
                encodeMessage({
                    type: "varbit",
                    payload: {
                        varbitId: VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE,
                        value: musicUnlockMsgValue,
                    },
                }),
                "varbit",
            ),
        );

        const xpDropsEnabledValue = player.varps.getVarbitValue(VARBIT_XPDROPS_ENABLED);
        this.services.networkLayer.withDirectSendBypass("varbit", () =>
            this.services.networkLayer.sendWithGuard(
                sock,
                encodeMessage({
                    type: "varbit",
                    payload: {
                        varbitId: VARBIT_XPDROPS_ENABLED,
                        value: xpDropsEnabledValue,
                    },
                }),
                "varbit",
            ),
        );
    }
}
