import type { PlayerState } from "../game/player";
import type { InterfaceService } from "./InterfaceService";

export const WORLD_MAP_GROUP_ID = 595;
export const FLOATER_BLANKMODAL_GROUP_ID = 594;
export const WORLD_MAP_CLOSE_WIDGET_ID = (WORLD_MAP_GROUP_ID << 16) | 38;
export const SCRIPT_WORLDMAP_TRANSMIT_DATA = 1749;

export function packWorldMapPlayerCoord(player: PlayerState): number {
    const level = Math.max(0, Math.min(3, player.level | 0));
    return (level << 28) | ((player.tileX & 0x3fff) << 14) | (player.tileY & 0x3fff);
}

export function getWorldMapTransmitDataArgs(
    playerOrPackedCoord: PlayerState | number,
): [number, number, number] {
    const packedCoord =
        typeof playerOrPackedCoord === "number"
            ? playerOrPackedCoord | 0
            : packWorldMapPlayerCoord(playerOrPackedCoord);
    return [packedCoord, -1, -1];
}

export function closeWorldMapInterfaces(
    player: PlayerState,
    interfaceService?: InterfaceService,
): boolean {
    const closedEntries = [
        ...player.widgets.close(WORLD_MAP_GROUP_ID),
        ...player.widgets.close(FLOATER_BLANKMODAL_GROUP_ID),
    ];
    if (closedEntries.length === 0) {
        return false;
    }
    interfaceService?.triggerCloseHooksForEntries(player, closedEntries);
    return true;
}
