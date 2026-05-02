import type { PlayerState } from "../../src/game/player";
import type { GamemodeUiBridge, GamemodeUiController } from "../../src/game/gamemodes/GamemodeDefinition";
import {
    type LeagueWsUiBridge,
    type LeagueWsUiPlayer,
    getLeagueSideJournalBootstrapState,
    normalizeSideJournalLeagueState,
    queueActivateQuestSideTab,
} from "./scripts/leagueWidgets";
import {
    applyLeagueTutorialUiState,
    LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL,
    queueLeagueTutorialOverlayAndState,
} from "./scripts/leagueTutorialUiState";
import { VARBIT_LEAGUE_TUTORIAL_COMPLETED } from "../../../src/shared/vars";

const SIDE_JOURNAL_GROUP_ID = 629;

export class LeaguesVUiController implements GamemodeUiController {
    private readonly leagueBridge: LeagueWsUiBridge;

    constructor(bridge: GamemodeUiBridge) {
        this.leagueBridge = {
            queueWidgetEvent: (playerId, action) => bridge.queueWidgetEvent(playerId, action),
            isWidgetGroupOpenInLedger: (playerId, groupId) =>
                bridge.isWidgetGroupOpenInLedger(playerId, groupId),
            queueVarp: (playerId, varpId, value) => bridge.queueVarp(playerId, varpId, value),
            queueVarbit: (playerId, varbitId, value) =>
                bridge.queueVarbit(playerId, varbitId, value),
        };
    }

    private asLeaguePlayer(player: PlayerState): LeagueWsUiPlayer {
        return player as unknown as LeagueWsUiPlayer;
    }

    normalizeSideJournalState(
        player: PlayerState,
        incomingStateVarp?: number,
    ): { tab: number; stateVarp: number } {
        return normalizeSideJournalLeagueState(this.asLeaguePlayer(player), incomingStateVarp);
    }

    applySideJournalUi(player: PlayerState): void {
        applyLeagueTutorialUiState(this.asLeaguePlayer(player), this.leagueBridge);
    }

    queueTutorialOverlay(
        player: PlayerState,
        opts?: { queueFlashsideVarbitOnStep3?: boolean },
    ): void {
        queueLeagueTutorialOverlayAndState(
            this.asLeaguePlayer(player),
            this.leagueBridge,
            opts,
        );
    }

    handleWidgetClose(player: PlayerState, groupId: number): void {
        if (groupId === SIDE_JOURNAL_GROUP_ID) {
            applyLeagueTutorialUiState(this.asLeaguePlayer(player), this.leagueBridge, {
                queueSideJournalContent: false,
            });
        }
    }

    handleWidgetOpen(_player: PlayerState, _groupId: number): void {}

    activateQuestTab(playerId: number): void {
        queueActivateQuestSideTab(playerId, this.leagueBridge);
    }

    shouldActivateQuestTabOnLogin(player: PlayerState): boolean {
        return (
            player.varps.getVarbitValue(VARBIT_LEAGUE_TUTORIAL_COMPLETED) !==
            LEAGUE_TUTORIAL_STEP_OPEN_JOURNAL
        );
    }

    getSideJournalBootstrapState(player: PlayerState): {
        varps: Record<number, number>;
        varbits: Record<number, number>;
    } {
        return getLeagueSideJournalBootstrapState(this.asLeaguePlayer(player));
    }
}
