import {
    VARBIT_FLASHSIDE,
    VARBIT_LEAGUE_TUTORIAL_COMPLETED,
    VARP_LEAGUE_GENERAL,
} from "../../../../src/shared/vars";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { LeagueTaskService } from "../LeagueTaskService";
import { syncLeagueGeneralVarp } from "../leagueGeneral";
import { getTutorialCompleteStep } from "../playerWorldRules";
import { LEAGUE_TUTORIAL_MAIN_GROUP_ID, closeLeagueTutorialOverlay } from "./leagueTutorialOverlay";
import {
    LEAGUE_TUTORIAL_STEP_WELCOME,
    advanceLeagueTutorialToLeaguesSubtabPrompt,
    createLeagueTutorialScriptBridge,
    isLeagueTutorialWaitingForQuestTab,
    startLeagueTutorialFromIntro,
} from "./leagueTutorialUiState";

// Widget child IDs (cache group 677)
const COMP_TUTORIAL_BUTTON_LEFT = 8;
const COMP_TUTORIAL_BUTTON_RIGHT = 9;

// Toplevel quest/journal tab clickable components (RuneLite interface mappings).
// - Fixed viewport (548): quests_tab = 66
// - Resizable viewport (161): quests_tab = 61
const TOPLEVEL_RESIZABLE_GROUP_ID = 161;
const TOPLEVEL_FIXED_GROUP_ID = 548;
const RESIZABLE_QUESTS_TAB_COMPONENT = 61;
const FIXED_QUESTS_TAB_COMPONENT = 66;

export function registerLeagueTutorialWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    // "Exit Leagues" (left) / "Get Started" (right)
    registry.onButton(LEAGUE_TUTORIAL_MAIN_GROUP_ID, COMP_TUTORIAL_BUTTON_LEFT, (event) => {
        const player = event.player;
        const tutorial = player.varps.getVarbitValue?.(VARBIT_LEAGUE_TUTORIAL_COMPLETED) ?? 0;
        if (tutorial === LEAGUE_TUTORIAL_STEP_WELCOME) {
            // Exit Leagues (OSRS: logs out / leaves league world).
            services.appearance.logoutPlayer(player, "exit_leagues");
            return;
        }
        // End Tutorial - allow at step 9 (after Karamja unlock) or step 11 (finishing)
        if (tutorial >= 9) {
            // Close the modal immediately before any varbit updates
            closeLeagueTutorialOverlay(player, services);

            const completeStep = getTutorialCompleteStep(player);
            player.varps.setVarbitValue(VARBIT_LEAGUE_TUTORIAL_COMPLETED, completeStep);
            player.varps.setVarbitValue(VARBIT_FLASHSIDE, 0);
            player.account.accountStage = 2;
            // Tutorial finished: teleport player to Lumbridge (post-tutorial start area)
            services.movement.teleportPlayer(player, 3222, 3218, 0, true);
            const { value: leagueGeneral } = syncLeagueGeneralVarp(player);
            services.variables.queueVarp?.(player.id, VARP_LEAGUE_GENERAL, leagueGeneral);
            services.variables.queueVarbit?.(
                player.id,
                VARBIT_LEAGUE_TUTORIAL_COMPLETED,
                completeStep,
            );
            services.variables.queueVarbit?.(player.id, VARBIT_FLASHSIDE, 0);
            services.appearance.savePlayerSnapshot(player);

            // Open the remaining tabs now that the tutorial is complete.
            // During the tutorial, only the Quest tab was visible.
            services.dialog.openRemainingTabs(player);

            // League task: "Complete the Leagues Tutorial" (taskId=190)
            try {
                const res = LeagueTaskService.completeTask(player, 190);
                if (res.changed) {
                    for (const v of res.varpUpdates) {
                        services.variables.queueVarp?.(player.id, v.id, v.value);
                    }
                    for (const v of res.varbitUpdates) {
                        services.variables.queueVarbit?.(player.id, v.id, v.value);
                    }
                    if (res.notification) {
                        services.messaging.queueNotification?.(player.id, res.notification);
                    }
                }
            } catch {}
        }
    });

    registry.onButton(LEAGUE_TUTORIAL_MAIN_GROUP_ID, COMP_TUTORIAL_BUTTON_RIGHT, (event) => {
        const player = event.player;
        const tutorial = player.varps.getVarbitValue?.(VARBIT_LEAGUE_TUTORIAL_COMPLETED) ?? 0;
        if (tutorial !== LEAGUE_TUTORIAL_STEP_WELCOME) return;

        // Tutorial starts now (step > 0): place the player in the tutorial area.
        try {
            const requestTeleportAction = services.movement.requestTeleportAction;
            if (!requestTeleportAction) {
                services.system.logger.warn?.(
                    "[script:league_tutorial] requestTeleportAction service unavailable; tutorial-start teleport skipped",
                );
            } else {
                requestTeleportAction(player, {
                    x: 3094,
                    y: 3107,
                    level: 0,
                    delayTicks: 0,
                    cooldownTicks: 1,
                    requireCanTeleport: false,
                    rejectIfPending: false,
                    replacePending: true,
                });
            }
        } catch {}

        startLeagueTutorialFromIntro(player, createLeagueTutorialScriptBridge(player, services));
    });

    // Quest tab icon (toplevel) click advances tutorial to the "open Leagues subtab" step.
    // Desktop resizable: 161:61 (quests_tab)
    registry.onButton(TOPLEVEL_RESIZABLE_GROUP_ID, RESIZABLE_QUESTS_TAB_COMPONENT, (event) => {
        const player = event.player;
        if (player.displayMode === 4) return; // mobile uses a different toplevel
        const tutorial = player.varps.getVarbitValue?.(VARBIT_LEAGUE_TUTORIAL_COMPLETED) ?? 0;
        if (!isLeagueTutorialWaitingForQuestTab(tutorial)) {
            return;
        }
        advanceLeagueTutorialToLeaguesSubtabPrompt(
            player,
            createLeagueTutorialScriptBridge(player, services),
        );
    });

    // Desktop fixed: 548:66 (quests_tab)
    registry.onButton(TOPLEVEL_FIXED_GROUP_ID, FIXED_QUESTS_TAB_COMPONENT, (event) => {
        const player = event.player;
        if (player.displayMode === 4) return; // mobile uses a different toplevel
        const tutorial = player.varps.getVarbitValue?.(VARBIT_LEAGUE_TUTORIAL_COMPLETED) ?? 0;
        if (!isLeagueTutorialWaitingForQuestTab(tutorial)) {
            return;
        }
        advanceLeagueTutorialToLeaguesSubtabPrompt(
            player,
            createLeagueTutorialScriptBridge(player, services),
        );
    });

    // Mobile: 601:118 (tab container)
    registry.onButton(601, 118, (event) => {
        const player = event.player;
        if (player.displayMode !== 4) return;
        const tutorial = player.varps.getVarbitValue?.(VARBIT_LEAGUE_TUTORIAL_COMPLETED) ?? 0;
        if (!isLeagueTutorialWaitingForQuestTab(tutorial)) {
            return;
        }
        advanceLeagueTutorialToLeaguesSubtabPrompt(
            player,
            createLeagueTutorialScriptBridge(player, services),
        );
    });
}
