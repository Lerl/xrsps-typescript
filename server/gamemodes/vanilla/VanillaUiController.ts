import {
    ACCOUNT_SUMMARY_COLLECTION_ACTION_FLAGS,
    ACCOUNT_SUMMARY_COLLECTION_LOG_CHILD_INDEX,
    ACCOUNT_SUMMARY_ENTRY_LIST_UID,
    ACCOUNT_SUMMARY_GROUP_ID,
    ACCOUNT_SUMMARY_PLAYTIME_ACTION_FLAGS,
    ACCOUNT_SUMMARY_PLAYTIME_CHILD_INDEX,
} from "../../../src/shared/ui/accountSummary";
import {
    DIARY_LIST_ENTRY_EVENT_FLAGS,
    DIARY_LIST_ENTRY_MAX_SLOT,
    DIARY_LIST_TASKBOX_UID,
    INTERFACE_ACHIEVEMENT_DIARY_ID,
    INTERFACE_QUEST_LIST_ID,
    QUEST_LIST_ENTRY_EVENT_FLAGS,
    QUEST_LIST_ENTRY_LIST_UID,
    QUEST_LIST_ENTRY_MAX_SLOT,
    SIDE_JOURNAL_ACHIEVEMENT_DIARY_TAB,
    SIDE_JOURNAL_CHARACTER_SUMMARY_TAB,
    SIDE_JOURNAL_CONTENT_GROUP_BY_TAB,
    SIDE_JOURNAL_GROUP_ID,
    SIDE_JOURNAL_TAB_CONTAINER_UID,
    decodeSideJournalTabFromStateVarp,
    encodeSideJournalTabInStateVarp,
} from "../../../src/shared/ui/sideJournal";
import { VARBIT_SIDE_JOURNAL_TAB, VARP_SIDE_JOURNAL_STATE } from "../../../src/shared/vars";
import type {
    GamemodeQuestListGroup,
    GamemodeUiBridge,
    GamemodeUiController,
} from "../../src/game/gamemodes/GamemodeDefinition";
import type { PlayerState } from "../../src/game/player";
import { GameframeTab, SCRIPT_FOCUS_TAB } from "../../src/widgets/InterfaceService";
import { queuePlayerQuestListUi } from "./widgets/questListUi";

function normalizeVanillaSideJournalTab(tab: number): number {
    return tab >= SIDE_JOURNAL_CHARACTER_SUMMARY_TAB && tab <= SIDE_JOURNAL_ACHIEVEMENT_DIARY_TAB
        ? tab
        : SIDE_JOURNAL_CHARACTER_SUMMARY_TAB;
}

export class VanillaUiController implements GamemodeUiController {
    constructor(
        private readonly bridge: GamemodeUiBridge,
        private readonly getQuestListGroups: (
            player: PlayerState,
        ) => readonly GamemodeQuestListGroup[] = () => [],
    ) {}

    normalizeSideJournalState(
        player: PlayerState,
        incomingStateVarp?: number,
    ): { tab: number; stateVarp: number } {
        const baseStateVarp =
            incomingStateVarp ?? player.varps.getVarpValue(VARP_SIDE_JOURNAL_STATE);
        const tab = normalizeVanillaSideJournalTab(
            decodeSideJournalTabFromStateVarp(baseStateVarp),
        );
        const stateVarp = encodeSideJournalTabInStateVarp(baseStateVarp, tab);
        player.varps.setVarpValue(VARP_SIDE_JOURNAL_STATE, stateVarp);
        player.varps.setVarbitValue(VARBIT_SIDE_JOURNAL_TAB, tab);
        return { tab, stateVarp };
    }

    applySideJournalUi(player: PlayerState): void {
        if (!this.bridge.isWidgetGroupOpenInLedger(player.id, SIDE_JOURNAL_GROUP_ID)) return;

        const { tab } = this.normalizeSideJournalState(player);
        const contentGroup =
            SIDE_JOURNAL_CONTENT_GROUP_BY_TAB[tab] ??
            SIDE_JOURNAL_CONTENT_GROUP_BY_TAB[SIDE_JOURNAL_CHARACTER_SUMMARY_TAB] ??
            0;
        if (contentGroup <= 0) return;

        this.bridge.queueWidgetEvent(player.id, {
            action: "open_sub",
            targetUid: SIDE_JOURNAL_TAB_CONTAINER_UID,
            groupId: contentGroup,
            type: 1,
        });

        if (contentGroup === INTERFACE_QUEST_LIST_ID) {
            queuePlayerQuestListUi(player, this.bridge, this.getQuestListGroups(player));
            this.bridge.queueWidgetEvent(player.id, {
                action: "set_flags_range",
                uid: QUEST_LIST_ENTRY_LIST_UID,
                fromSlot: 0,
                toSlot: QUEST_LIST_ENTRY_MAX_SLOT,
                flags: QUEST_LIST_ENTRY_EVENT_FLAGS,
            });
        }

        if (contentGroup === INTERFACE_ACHIEVEMENT_DIARY_ID) {
            this.bridge.queueWidgetEvent(player.id, {
                action: "set_flags_range",
                uid: DIARY_LIST_TASKBOX_UID,
                fromSlot: 0,
                toSlot: DIARY_LIST_ENTRY_MAX_SLOT,
                flags: DIARY_LIST_ENTRY_EVENT_FLAGS,
            });
        }

        if (contentGroup === ACCOUNT_SUMMARY_GROUP_ID) {
            this.bridge.queueWidgetEvent(player.id, {
                action: "set_flags_range",
                uid: ACCOUNT_SUMMARY_ENTRY_LIST_UID,
                fromSlot: ACCOUNT_SUMMARY_COLLECTION_LOG_CHILD_INDEX,
                toSlot: ACCOUNT_SUMMARY_COLLECTION_LOG_CHILD_INDEX,
                flags: ACCOUNT_SUMMARY_COLLECTION_ACTION_FLAGS,
            });
            this.bridge.queueWidgetEvent(player.id, {
                action: "set_flags_range",
                uid: ACCOUNT_SUMMARY_ENTRY_LIST_UID,
                fromSlot: ACCOUNT_SUMMARY_PLAYTIME_CHILD_INDEX,
                toSlot: ACCOUNT_SUMMARY_PLAYTIME_CHILD_INDEX,
                flags: ACCOUNT_SUMMARY_PLAYTIME_ACTION_FLAGS,
            });
        }
    }

    queueTutorialOverlay(
        _player: PlayerState,
        _opts?: { queueFlashsideVarbitOnStep3?: boolean },
    ): void {}

    handleWidgetClose(_player: PlayerState, _groupId: number): void {}

    handleWidgetOpen(_player: PlayerState, _groupId: number): void {}

    activateQuestTab(playerId: number): void {
        this.bridge.queueWidgetEvent(playerId, {
            action: "run_script",
            scriptId: SCRIPT_FOCUS_TAB,
            args: [GameframeTab.QUEST],
        });
    }

    shouldActivateQuestTabOnLogin(_player: PlayerState): boolean {
        return true;
    }

    getSideJournalBootstrapState(player: PlayerState): {
        varps: Record<number, number>;
        varbits: Record<number, number>;
    } {
        const { tab, stateVarp } = this.normalizeSideJournalState(player);
        return {
            varps: {
                [VARP_SIDE_JOURNAL_STATE]: stateVarp,
            },
            varbits: {
                [VARBIT_SIDE_JOURNAL_TAB]: tab,
            },
        };
    }
}
