import type { ActionEffect, ActionExecutionResult } from "../../../src/game/actions/types";
import type { PlayerState } from "../../../src/game/player";
import type { ScriptServices } from "../../../src/game/scripts/types";

export const SKILL_ERROR_SOUND = 2277;

export function buildMessageEffect(player: PlayerState, message: string): ActionEffect {
    return { type: "message", playerId: player.id, message };
}

export function hasAnyCarriedItem(carriedItemIds: number[], candidateItemIds: number[]): boolean {
    if (carriedItemIds.length === 0 || candidateItemIds.length === 0) return false;
    const carried = new Set(carriedItemIds);
    return candidateItemIds.some((id) => carried.has(id));
}

export function describeItem(services: ScriptServices, itemId: number): string {
    return services.data.getObjType(itemId)?.name?.toLowerCase() ?? "item";
}

export function failGatheringPrecheck(
    player: PlayerState,
    services: ScriptServices,
    message: string,
    opts?: { errorSound?: boolean },
): ActionExecutionResult {
    services.stopGatheringInteraction?.(player);
    if (opts?.errorSound) {
        services.sound.sendSound(player, SKILL_ERROR_SOUND);
    }
    const effects: ActionEffect[] = message ? [buildMessageEffect(player, message)] : [];
    return { ok: true, effects };
}
