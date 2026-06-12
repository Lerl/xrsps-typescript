import { EquipmentSlot } from "../../../../src/rs/config/player/Equipment";
import { resolveEmotePlayback } from "../../../src/game/emotes";
import {
    getSkillcapeSeqId,
    getSkillcapeSpotId,
    type IScriptRegistry,
    type ScriptServices,
    type WidgetActionEvent,
} from "../../../src/game/scripts/types";

/**
 * Emote widget handlers for interface 216 (emotes tab).
 *
 * Uses onButton registration since binary IF_BUTTON packets don't send option strings.
 * Emotes are dynamic children where slot = emote index (0-55).
 * Op1/op2 are Perform/Loop; loop-first emotes (Sit down, Crab dance) swap them.
 */

const EMOTE_WIDGET_GROUP_ID = 216;
// Contents container the emote buttons are created on ($com_emote_contents
// in the 216:0 onLoad args). Clicks on dynamic children transmit the parent
// component id, so IF_BUTTON arrives as 216:2 with slot = emote index.
const EMOTE_CONTAINER_COMPONENT = 2;
const SKILLCAPE_EMOTE_INDEX = 43;
const SKILLCAPE_SPOT_HEIGHT = 120; // ~0.94 tiles (head height)
const EMOTE_MAX_INDEX = 55;

export function registerEmoteWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registry.onButton(EMOTE_WIDGET_GROUP_ID, EMOTE_CONTAINER_COMPONENT, (event) => {
        handleEmote(event, services);
    });
}

/**
 * Handle emote button click
 */
function handleEmote(event: WidgetActionEvent, services: ScriptServices): void {
    const player = event.player;
    const slot = event.slot;
    const opId = event.opId ?? 1;

    // Slot corresponds to emote index (0-55)
    if (slot === undefined || slot < 0 || slot > EMOTE_MAX_INDEX) {
        services.system.logger.debug?.(`[emote] invalid slot=${slot} for player=${player.id}`);
        return;
    }

    const emoteIndex = slot;
    let seqId: number | undefined;
    let spotId: number | undefined;
    let isLoop = false;

    if (emoteIndex === SKILLCAPE_EMOTE_INDEX) {
        // Skillcape emote - sequence and spot derive from the equipped cape
        const capeId = services.equipment.getEquippedItem(player, EquipmentSlot.CAPE) ?? -1;
        if (capeId > 0) {
            seqId = getSkillcapeSeqId(capeId);
            spotId = getSkillcapeSpotId(capeId);
        }
    } else {
        const playback = resolveEmotePlayback(emoteIndex, opId, player);
        if (playback) {
            seqId = playback.seqId;
            isLoop = playback.loop;
        }
    }

    if (seqId === undefined || seqId < 0) {
        services.system.logger.debug?.(
            `[emote] unknown emote index=${emoteIndex} for player=${player.id}`,
        );
        return;
    }

    // Play the emote sequence with immediate feedback to the client
    if (services.animation.playPlayerSeqImmediate) {
        services.animation.playPlayerSeqImmediate(player, seqId);
        services.system.logger.info?.(
            `[emote] player=${player.id} emote=${emoteIndex} seq=${seqId} loop=${isLoop}`,
        );
    } else if (services.animation.playPlayerSeq) {
        // Fallback to delayed playback
        services.animation.playPlayerSeq(player, seqId, 0);
        services.system.logger.info?.(
            `[emote] player=${player.id} emote=${emoteIndex} seq=${seqId} loop=${isLoop} (delayed)`,
        );
    } else {
        services.system.logger.warn?.(`[emote] playPlayerSeq service not available`);
    }

    // For the skillcape emote, also broadcast the cape's spot animation
    if (emoteIndex === SKILLCAPE_EMOTE_INDEX && spotId !== undefined && spotId >= 0) {
        services.animation.broadcastPlayerSpot(player, spotId, SKILLCAPE_SPOT_HEIGHT, 0);
        services.system.logger.debug?.(
            `[emote] skillcape spot player=${player.id} spotId=${spotId}`,
        );
    }
}
