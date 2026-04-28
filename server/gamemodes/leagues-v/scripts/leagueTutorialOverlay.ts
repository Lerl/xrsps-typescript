import type { PlayerState } from "../../../src/game/player";
import type { ScriptServices } from "../../../src/game/scripts/types";

import { getViewportTrackerFrontUid } from "../../../src/game/scripts/types";

export const LEAGUE_TUTORIAL_MAIN_GROUP_ID = 677; // league_tutorial_main

export function closeLeagueTutorialOverlay(player: PlayerState, services: ScriptServices): void {
    const targetUid = getViewportTrackerFrontUid(player.displayMode);
    services.dialog.closeSubInterface(player, targetUid, LEAGUE_TUTORIAL_MAIN_GROUP_ID);
    services.dialog.queueWidgetEvent(player.id, {
        action: "close_sub",
        targetUid,
    });
}
