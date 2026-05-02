import type { PlayerState } from "../../../src/game/player";
import type { ScriptServices } from "../../../src/game/scripts/types";
import { DisplayMode, getQuestTabUid } from "../../../src/widgets/viewport";
import {
    SIDE_JOURNAL_GROUP_ID,
    SIDE_JOURNAL_QUEST_TAB,
    encodeSideJournalTabInStateVarp,
} from "../../../../src/shared/ui/sideJournal";
import {
    VARBIT_FLASHSIDE,
    VARBIT_LEAGUE_TUTORIAL_COMPLETED,
    VARBIT_SIDE_JOURNAL_TAB,
    VARP_LEAGUE_GENERAL,
    VARP_SIDE_JOURNAL_STATE,
} from "../../../../src/shared/vars";
import { syncLeagueGeneralVarp } from "../leagueGeneral";
import {
    applyLeagueTutorialStepFiveUi,
    applyLeagueTutorialStepFourUi,
    applyLeagueTutorialStepNineUi,
    normalizeSideJournalLeagueState,
    queueLeagueTutorialOverlayUi,
    queueSideJournalLeagueOnlyUi,
    type LeagueWsUiBridge,
    type LeagueWsUiPlayer,
} from "./leagueWidgets";

export const LEAGUE_TUTORIAL_STEP_WELCOME = 0;
export const LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL = 3;
export const LEAGUE_TUTORIAL_STEP_OPEN_LEAGUES_SUBTAB = 4;
export const LEAGUE_TUTORIAL_STEP_OPEN_LEAGUES_PANEL = 5;

// toplevel_sidebuttons_enable uses %flashside - 1.
const FLASHSIDE_QUEST_TAB = 3;

type LeagueTutorialUiPlayer = LeagueWsUiPlayer & {
    widgets?: {
        isOpen?: (groupId: number) => boolean;
        open?: (
            groupId: number,
            opts?: {
                targetUid?: number;
                type?: number;
                modal?: boolean;
                varps?: Record<number, number>;
                varbits?: Record<number, number>;
            },
        ) => void;
    };
};

type LeagueTutorialUiStateOptions = {
    queueSideJournalState?: boolean;
    queueFlashside?: boolean;
    queueFlashsideVarbitOnStep3?: boolean;
    queueSideJournalContent?: boolean;
    forceQueueSideJournalContent?: boolean;
    activateQuestSideTab?: boolean;
    applyHighlights?: boolean;
};

export function createLeagueTutorialScriptBridge(
    player: PlayerState,
    services: ScriptServices,
): LeagueWsUiBridge {
    return {
        queueWidgetEvent: services.dialog.queueWidgetEvent,
        queueVarp: (playerId, varpId, value) =>
            services.variables.queueVarp?.(playerId, varpId, value),
        queueVarbit: (playerId, varbitId, value) =>
            services.variables.queueVarbit?.(playerId, varbitId, value),
        isWidgetGroupOpenInLedger: (_playerId, groupId) =>
            player.widgets?.isOpen?.(groupId) ?? false,
    };
}

export function isLeagueTutorialWaitingForQuestTab(tutorialStep: number): boolean {
    return (
        tutorialStep === LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL ||
        tutorialStep === LEAGUE_TUTORIAL_STEP_OPEN_LEAGUES_SUBTAB
    );
}

function syncLeagueGeneralAndQueue(
    player: LeagueWsUiPlayer,
    bridge: Pick<LeagueWsUiBridge, "queueVarp">,
): void {
    const res = syncLeagueGeneralVarp(player as unknown as PlayerState);
    if (res.changed) {
        bridge.queueVarp(player.id, VARP_LEAGUE_GENERAL, res.value);
    }
}

export function syncLeagueTutorialSideJournalState(
    player: LeagueWsUiPlayer,
    bridge: Pick<LeagueWsUiBridge, "queueVarp" | "queueVarbit">,
): { tab: number; stateVarp: number } {
    const prevStateVarp = player.varps.getVarpValue(VARP_SIDE_JOURNAL_STATE);
    const prevTab = player.varps.getVarbitValue(VARBIT_SIDE_JOURNAL_TAB);
    const state = normalizeSideJournalLeagueState(player);
    if (state.stateVarp !== prevStateVarp) {
        bridge.queueVarp(player.id, VARP_SIDE_JOURNAL_STATE, state.stateVarp);
    }
    if (state.tab !== prevTab) {
        bridge.queueVarbit(player.id, VARBIT_SIDE_JOURNAL_TAB, state.tab);
    }
    return state;
}

function syncLeagueTutorialFlashside(
    player: LeagueWsUiPlayer,
    bridge: Pick<LeagueWsUiBridge, "queueVarbit">,
    opts: LeagueTutorialUiStateOptions,
): void {
    const tutorialStep = player.varps.getVarbitValue(VARBIT_LEAGUE_TUTORIAL_COMPLETED);
    const current = player.varps.getVarbitValue(VARBIT_FLASHSIDE);
    let desired = current;

    if (tutorialStep === LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL) {
        desired = FLASHSIDE_QUEST_TAB;
    } else if (tutorialStep >= LEAGUE_TUTORIAL_STEP_OPEN_LEAGUES_SUBTAB) {
        desired = 0;
    }

    const forceQueue =
        tutorialStep === LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL &&
        opts.queueFlashsideVarbitOnStep3 === true;
    if (desired !== current || forceQueue) {
        player.varps.setVarbitValue(VARBIT_FLASHSIDE, desired);
        bridge.queueVarbit(player.id, VARBIT_FLASHSIDE, desired);
    }
}

export function applyLeagueTutorialUiState(
    player: LeagueTutorialUiPlayer,
    bridge: LeagueWsUiBridge,
    opts: LeagueTutorialUiStateOptions = {},
): void {
    const tutorialStep = player.varps.getVarbitValue(VARBIT_LEAGUE_TUTORIAL_COMPLETED);
    if (opts.queueSideJournalState !== false) {
        syncLeagueTutorialSideJournalState(player, bridge);
    }
    if (opts.queueFlashside !== false) {
        syncLeagueTutorialFlashside(player, bridge, opts);
    }

    const sideJournalOpen = bridge.isWidgetGroupOpenInLedger(
        player.id,
        SIDE_JOURNAL_GROUP_ID,
    );
    if (
        opts.queueSideJournalContent !== false &&
        (sideJournalOpen || opts.forceQueueSideJournalContent === true)
    ) {
        const activateQuestSideTab =
            opts.activateQuestSideTab ??
            tutorialStep !== LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL;
        queueSideJournalLeagueOnlyUi(player, bridge, { activateQuestSideTab });
    }

    if (opts.applyHighlights !== false) {
        applyLeagueTutorialStepFourUi(player, bridge);
        applyLeagueTutorialStepFiveUi(player, bridge);
        applyLeagueTutorialStepNineUi(player, bridge);
    }
}

export function enterLeagueTutorialStep(
    player: LeagueTutorialUiPlayer,
    bridge: LeagueWsUiBridge,
    tutorialStep: number,
    opts: LeagueTutorialUiStateOptions = {},
): void {
    player.varps.setVarbitValue(VARBIT_LEAGUE_TUTORIAL_COMPLETED, tutorialStep);
    bridge.queueVarbit(player.id, VARBIT_LEAGUE_TUTORIAL_COMPLETED, tutorialStep);
    syncLeagueGeneralAndQueue(player, bridge);
    applyLeagueTutorialUiState(player, bridge, opts);
}

function openQuestJournalRoot(player: LeagueTutorialUiPlayer): void {
    const displayMode = player.displayMode ?? DisplayMode.RESIZABLE_NORMAL;
    const questTabUid = getQuestTabUid(displayMode);
    player.widgets?.open?.(SIDE_JOURNAL_GROUP_ID, {
        targetUid: questTabUid,
        type: 1,
        modal: false,
        varps: {
            [VARP_SIDE_JOURNAL_STATE]: player.varps.getVarpValue(VARP_SIDE_JOURNAL_STATE),
        },
        varbits: {
            [VARBIT_SIDE_JOURNAL_TAB]: player.varps.getVarbitValue(VARBIT_SIDE_JOURNAL_TAB),
        },
    });
}

export function startLeagueTutorialFromIntro(
    player: LeagueTutorialUiPlayer,
    bridge: LeagueWsUiBridge,
): number {
    const sideJournalOpen = bridge.isWidgetGroupOpenInLedger(
        player.id,
        SIDE_JOURNAL_GROUP_ID,
    );
    const nextStep = sideJournalOpen
        ? LEAGUE_TUTORIAL_STEP_OPEN_LEAGUES_SUBTAB
        : LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL;

    enterLeagueTutorialStep(player, bridge, nextStep, {
        queueSideJournalContent: false,
        applyHighlights: false,
    });
    if (sideJournalOpen) {
        applyLeagueTutorialUiState(player, bridge, {
            queueSideJournalState: false,
            queueFlashside: false,
        });
        return nextStep;
    }

    openQuestJournalRoot(player);
    applyLeagueTutorialUiState(player, bridge, {
        queueSideJournalState: false,
        queueFlashside: false,
        activateQuestSideTab: false,
        applyHighlights: false,
    });
    return nextStep;
}

export function advanceLeagueTutorialToLeaguesSubtabPrompt(
    player: LeagueTutorialUiPlayer,
    bridge: LeagueWsUiBridge,
): void {
    const sideJournalOpen = bridge.isWidgetGroupOpenInLedger(
        player.id,
        SIDE_JOURNAL_GROUP_ID,
    );
    enterLeagueTutorialStep(player, bridge, LEAGUE_TUTORIAL_STEP_OPEN_LEAGUES_SUBTAB, {
        queueSideJournalContent: false,
        applyHighlights: false,
    });
    if (!sideJournalOpen) {
        openQuestJournalRoot(player);
    }
    applyLeagueTutorialUiState(player, bridge, {
        queueSideJournalState: false,
        queueFlashside: false,
    });
}

export function advanceLeagueTutorialToLeaguesPanel(
    player: LeagueTutorialUiPlayer,
    bridge: LeagueWsUiBridge,
): void {
    enterLeagueTutorialStep(player, bridge, LEAGUE_TUTORIAL_STEP_OPEN_LEAGUES_PANEL);
}

export function queueLeagueTutorialOverlayAndState(
    player: LeagueTutorialUiPlayer,
    bridge: LeagueWsUiBridge,
    opts: { tutorialStep?: number; queueFlashsideVarbitOnStep3?: boolean } = {},
): void {
    const tutorialStep =
        opts.tutorialStep ??
        player.varps.getVarbitValue(VARBIT_LEAGUE_TUTORIAL_COMPLETED);
    applyLeagueTutorialUiState(player, bridge, {
        queueFlashsideVarbitOnStep3: opts.queueFlashsideVarbitOnStep3,
        queueSideJournalContent: false,
        applyHighlights: false,
    });
    queueLeagueTutorialOverlayUi(player, bridge, tutorialStep);
    applyLeagueTutorialUiState(player, bridge, {
        queueSideJournalState: false,
        queueFlashside: false,
    });
}

export function syncLeagueTutorialHandshakeState(
    player: LeagueWsUiPlayer,
    bridge: {
        sendVarp(varpId: number, value: number): void;
        sendVarbit(varbitId: number, value: number): void;
    },
): void {
    const tutorialStep = player.varps.getVarbitValue(VARBIT_LEAGUE_TUTORIAL_COMPLETED);
    if (tutorialStep !== LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL) {
        return;
    }

    const prevSideJournalState = player.varps.getVarpValue(VARP_SIDE_JOURNAL_STATE);
    const prevSideJournalTab = player.varps.getVarbitValue(VARBIT_SIDE_JOURNAL_TAB);
    const prevFlashside = player.varps.getVarbitValue(VARBIT_FLASHSIDE);
    const sideJournalState = encodeSideJournalTabInStateVarp(
        prevSideJournalState,
        SIDE_JOURNAL_QUEST_TAB,
    );
    player.varps.setVarpValue(VARP_SIDE_JOURNAL_STATE, sideJournalState);
    player.varps.setVarbitValue(VARBIT_SIDE_JOURNAL_TAB, SIDE_JOURNAL_QUEST_TAB);
    player.varps.setVarbitValue(VARBIT_FLASHSIDE, FLASHSIDE_QUEST_TAB);
    if (sideJournalState !== prevSideJournalState) {
        bridge.sendVarp(VARP_SIDE_JOURNAL_STATE, sideJournalState);
    }
    if (prevSideJournalTab !== SIDE_JOURNAL_QUEST_TAB) {
        bridge.sendVarbit(VARBIT_SIDE_JOURNAL_TAB, SIDE_JOURNAL_QUEST_TAB);
    }
    if (prevFlashside !== FLASHSIDE_QUEST_TAB) {
        bridge.sendVarbit(VARBIT_FLASHSIDE, FLASHSIDE_QUEST_TAB);
    }
}
