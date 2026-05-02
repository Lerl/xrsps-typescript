import type { PlayerState } from "../../../src/game/player";
import type { ScriptServices } from "../../../src/game/scripts/types";

import { getViewportTrackerFrontUid } from "../../../src/game/scripts/types";

export const LEAGUE_TUTORIAL_MAIN_GROUP_ID = 677; // league_tutorial_main
const LEAGUE_TUTORIAL_MAIN_ROOT_UID = (LEAGUE_TUTORIAL_MAIN_GROUP_ID << 16) | 0;

export function closeLeagueTutorialOverlay(player: PlayerState, services: ScriptServices): void {
    const targetUid = getViewportTrackerFrontUid(player.displayMode);
    const trackedOpen = player.widgets?.isOpen?.(LEAGUE_TUTORIAL_MAIN_GROUP_ID) ?? false;
    services.dialog.closeSubInterface(player, targetUid, LEAGUE_TUTORIAL_MAIN_GROUP_ID);

    // If the player changed display mode or the server/client ledger got out of sync,
    // the panel can be tracked under a different target. Close by group as a fallback
    // so the client receives a close_sub for the actual mount point.
    if (trackedOpen) {
        player.widgets?.close?.(LEAGUE_TUTORIAL_MAIN_GROUP_ID);
    }

    services.dialog.queueWidgetEvent(player.id, {
        action: "close_sub",
        targetUid,
    });
    services.dialog.queueWidgetEvent(player.id, {
        action: "set_hidden",
        uid: LEAGUE_TUTORIAL_MAIN_ROOT_UID,
        hidden: true,
        phase: "close",
    });
}
