import type { PlayerState } from "../../../src/game/player";
import {
    BaseComponentUids,
    type IScriptRegistry,
    ScriptServices,
    type WidgetActionHandler,
} from "../../../src/game/scripts/types";
import { getQuestDefinition, getQuestDefinitionByKey } from "../quests/QuestRegistry";
import {
    buildQuestMap,
    getQuestCompletionInfo,
    type QuestEntry,
} from "./questListData";
import { findPlayerQuestListQuestBySlot } from "./questListUi";

// ============================================================================
// Constants
// ============================================================================

/** Quest list interface group (side journal quest tab content) */
const QUEST_LIST_GROUP_ID = 399;
/** Dynamic list component inside quest list interface */
const QUEST_LIST_COMPONENT = 7;

/** Quest journal overlay interface */
const QUEST_JOURNAL_GROUP_ID = 119;
/** Title component: questjournal:title */
const QJ_TITLE_CHILD = 5;
/** Close button component: questjournal:close */
const QJ_CLOSE_CHILD = 8;
/** Switch View button component: questjournal:switch */
const QJ_SWITCH_VIEW_CHILD = 9;
/** First journal line component: questjournal:qj1 */
const QJ_FIRST_LINE_CHILD = 11;

/** Quest journal overview overlay interface */
const QUEST_JOURNAL_OVERVIEW_GROUP_ID = 782;
const QJO_CONTENT_OUTER_CHILD = 1;
const QJO_LAYOUT_CONTAINER_CHILD = 2;
const QJO_DECOR_MODEL_CHILD = 3;
const QJO_CONTENT_HOST_CHILD = 4;
const QJO_TITLE_CHILD = 5;
const QJO_SCROLLBAR_CHILD = 6;
const QJO_CONTENT_INNER_CHILD = 7;
const QJO_SCROLL_CHILD = 8;
const QJO_CLOSE_CHILD = 9;
const QJO_BACK_CHILD = 10;
const QJO_SWITCH_VIEW_CHILD = 11;

/** Varp: currently viewed quest (stores dbrow ID) */
const VARP_LATEST_QUEST_JOURNAL = 3679;
/** Varp: number of journal text lines */
const VARP_QJ_LINES = 4398;

/** CS2 script that clears all quest journal text fields */
const SCRIPT_QUEST_JOURNAL_RESET = 5240;
/** CS2 script that sets up quest journal scrollbar */
const SCRIPT_QUEST_JOURNAL_SCROLL = 2523;
/** CS2 script that builds the quest overview contents */
const SCRIPT_QUEST_JOURNAL_OVERVIEW_SETUP = 6821;

/** OP ID for "Read journal:" right-click option */
const OP_READ_JOURNAL = 2;

const OP1_TRANSMIT = 1 << 1;

// ============================================================================
// Journal text generation
// ============================================================================

/**
 * Build journal lines for a quest based on its completion status.
 *
 * Implemented quests (registered in the quest registry) generate stage-specific
 * journal text from their definitions. For the rest, we check the quest's
 * progress varp against its completion value to determine basic status.
 */
function buildJournalLines(
    player: PlayerState,
    quest: QuestEntry,
    services: ScriptServices,
): string[] {
    const definition = getQuestDefinition(quest.displayName);
    if (definition) {
        return definition.buildJournal(player, services);
    }
    // Check if quest was completed via ::quest command by checking known quest varps
    const completionEntry = getQuestCompletionInfo(quest.displayName);
    if (completionEntry) {
        const currentValue =
            completionEntry.varpId >= 0 ? player.varps.getVarpValue(completionEntry.varpId) : 0;

        // Check varbit entries too
        let allVarbitsComplete = true;
        if (completionEntry.varbitEntries) {
            for (const { varbitId, value } of completionEntry.varbitEntries) {
                if (player.varps.getVarbitValue(varbitId) < value) {
                    allVarbitsComplete = false;
                    break;
                }
            }
        }

        const isComplete =
            (completionEntry.varpId >= 0 && currentValue >= completionEntry.completionValue) ||
            (completionEntry.varpId < 0 && allVarbitsComplete);

        if (isComplete) {
            return ["<str>I have completed this quest.", "", "<col=ff0000>QUEST COMPLETE!"];
        }
    }

    // Not started (default state)
    return [
        "I should read the quest overview for",
        "more information on how to start",
        "this quest.",
    ];
}

export function registerQuestJournalWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    // Lazy-loaded quest map: the DbRepository is not available at module registration
    // time (scripts bootstrap before cache DB is initialized). Build on first click.
    let questMap: Map<number, QuestEntry> | undefined;

    const getQuestMap = (): Map<number, QuestEntry> => {
        if (!questMap) {
            questMap = buildQuestMap(services);
        }
        return questMap;
    };

    const findQuestByDbrowId = (dbrowId: number): QuestEntry | undefined => {
        for (const entry of getQuestMap().values()) {
            if (entry.dbrowId === dbrowId) return entry;
        }
        return undefined;
    };

    const findQuestByDisplayName = (displayName: string): QuestEntry | undefined => {
        const normalized = displayName.toLowerCase();
        for (const entry of getQuestMap().values()) {
            if (entry.displayName.toLowerCase() === normalized) return entry;
        }
        return undefined;
    };

    const findQuestByQuestListKey = (key: string): QuestEntry | undefined => {
        const definition = getQuestDefinitionByKey(key);
        if (!definition) return undefined;
        return findQuestByDisplayName(definition.name);
    };

    // Handle quest list clicks (399:7)
    // Gamemode-owned dynamic children use the visible row slot as their child index.
    registry.onButton(QUEST_LIST_GROUP_ID, QUEST_LIST_COMPONENT, (event) => {
        const { player, slot, opId } = event;

        if (opId !== OP_READ_JOURNAL) return;

        const visibleQuest = findPlayerQuestListQuestBySlot(player, slot);
        if (!visibleQuest) return;

        const quest =
            findQuestByQuestListKey(visibleQuest.key) ??
            findQuestByDisplayName(visibleQuest.displayName);
        if (!quest) {
            const label = `slot=${slot} key="${visibleQuest.key}" name="${visibleQuest.displayName}"`;
            services.system.logger.info?.(
                `[quest-journal] No quest found for visible ${label}`,
            );
            return;
        }

        openQuestJournal(player, quest, services);
    });

    // Handle quest journal Close button (119:8)
    registry.onButton(QUEST_JOURNAL_GROUP_ID, QJ_CLOSE_CHILD, (event) => {
        const floaterUid = BaseComponentUids.FLOATER_OVERLAY;
        services.dialog.closeSubInterface(event.player, floaterUid, QUEST_JOURNAL_GROUP_ID);
    });

    // Handle quest journal Switch View button (119:9)
    // Toggles between journal text and quest overview
    registry.onButton(QUEST_JOURNAL_GROUP_ID, QJ_SWITCH_VIEW_CHILD, (event) => {
        const { player } = event;
        const dbrowId = player.varps.getVarpValue(VARP_LATEST_QUEST_JOURNAL);
        if (dbrowId <= 0) return;

        const quest = findQuestByDbrowId(dbrowId);
        if (!quest) return;

        openQuestOverview(player, quest, services);
    });

    // Handle quest overview Close button (782:9)
    registry.onButton(QUEST_JOURNAL_OVERVIEW_GROUP_ID, QJO_CLOSE_CHILD, (event) => {
        const floaterUid = BaseComponentUids.FLOATER_OVERLAY;
        services.dialog.closeSubInterface(
            event.player,
            floaterUid,
            QUEST_JOURNAL_OVERVIEW_GROUP_ID,
        );
    });

    const handleOverviewSwitchView: WidgetActionHandler = (event) => {
        const { player } = event;
        const dbrowId = player.varps.getVarpValue(VARP_LATEST_QUEST_JOURNAL);
        if (dbrowId <= 0) return;

        const quest = findQuestByDbrowId(dbrowId);
        if (!quest) return;

        openQuestJournal(player, quest, services);
    };

    // Handle quest overview navigation buttons (782:10/11)
    registry.onButton(QUEST_JOURNAL_OVERVIEW_GROUP_ID, QJO_BACK_CHILD, handleOverviewSwitchView);
    registry.onButton(
        QUEST_JOURNAL_OVERVIEW_GROUP_ID,
        QJO_SWITCH_VIEW_CHILD,
        handleOverviewSwitchView,
    );
}

// ============================================================================
// Quest journal opening
// ============================================================================

/**
 * Open the quest journal overlay for a specific quest.
 *
 * Client parity note: Unlike OSRS where widget state persists across open/close,
 * this client only resolves set_text for widgets that are currently loaded.
 * Therefore we must open the interface FIRST, then set text and run scripts.
 *
 * Flow:
 * 1. Set varps (latest_quest_journal, qj_lines)
 * 2. Open interface 119 as overlay (loads widgets)
 * 3. Run quest_journal_reset to clear stale text
 * 4. Set title and journal line text
 * 5. Run scroll configuration script
 */
function openQuestJournal(player: PlayerState, quest: QuestEntry, services: ScriptServices): void {
    const lines = buildJournalLines(player, quest, services);
    const lineCount = lines.length;
    const playerId = player.id;

    // 1. Set varps (sent before widget events in broadcast order)
    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    player.varps.setVarpValue(VARP_QJ_LINES, lineCount);
    services.variables.sendVarp?.(player, VARP_QJ_LINES, lineCount);

    // 2. Open quest journal interface on the floater container.
    // Use type=0 (modal) so PlayerWidgetManager tracks it and closeInterruptibleInterfaces
    // closes it on walk/interaction, matching OSRS behavior where the journal dismisses on move.
    const floaterUid = BaseComponentUids.FLOATER_OVERLAY;
    services.dialog.openSubInterface(player, floaterUid, QUEST_JOURNAL_GROUP_ID, 0, {
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
            [VARP_QJ_LINES]: lineCount,
        },
    });

    // 2b. Enable transmit flags on Close (119:8) and Switch View (119:9) buttons.
    // Static widgets use fromSlot=-1, toSlot=-1.
    for (const childId of [QJ_CLOSE_CHILD, QJ_SWITCH_VIEW_CHILD]) {
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_flags_range",
            uid: (QUEST_JOURNAL_GROUP_ID << 16) | childId,
            fromSlot: -1,
            toSlot: -1,
            flags: OP1_TRANSMIT,
        });
    }

    // 3. Clear stale journal line text
    services.dialog.queueWidgetEvent(playerId, {
        action: "run_script",
        scriptId: SCRIPT_QUEST_JOURNAL_RESET,
        args: [],
    });

    // 4. Set title text
    const titleUid = (QUEST_JOURNAL_GROUP_ID << 16) | QJ_TITLE_CHILD;
    services.dialog.queueWidgetEvent(playerId, {
        action: "set_text",
        uid: titleUid,
        text: `<col=7f0000>${quest.displayName}</col>`,
    });

    // 5. Set journal line text
    for (let i = 0; i < lineCount; i++) {
        const lineUid = (QUEST_JOURNAL_GROUP_ID << 16) | (QJ_FIRST_LINE_CHILD + i);
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: lineUid,
            text: lines[i],
        });
    }

    // 6. Run scroll configuration script
    services.dialog.queueWidgetEvent(playerId, {
        action: "run_script",
        scriptId: SCRIPT_QUEST_JOURNAL_SCROLL,
        args: [0, lineCount],
    });

    services.system.logger.info?.(
        `[quest-journal] Opened journal for player=${playerId} quest="${quest.displayName}" (id=${quest.questId}, dbrow=${quest.dbrowId}) lines=${lineCount}`,
    );
}

function openQuestOverview(player: PlayerState, quest: QuestEntry, services: ScriptServices): void {
    const playerId = player.id;
    const definition = getQuestDefinition(quest.displayName);
    if (!definition?.overviewStartText) {
        services.system.logger.info?.(
            `[quest-journal] No overview start text for quest="${quest.displayName}" (dbrow=${quest.dbrowId})`,
        );
        return;
    }
    const overviewStartText = definition.overviewStartText;

    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);

    const floaterUid = BaseComponentUids.FLOATER_OVERLAY;
    services.dialog.openSubInterface(player, floaterUid, QUEST_JOURNAL_OVERVIEW_GROUP_ID, 0, {
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
            [definition.varpId]: player.varps.getVarpValue(definition.varpId),
        },
    });

    for (const childId of [QJO_CLOSE_CHILD, QJO_BACK_CHILD, QJO_SWITCH_VIEW_CHILD]) {
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_flags_range",
            uid: (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | childId,
            fromSlot: -1,
            toSlot: -1,
            flags: OP1_TRANSMIT,
        });
    }

    services.dialog.queueWidgetEvent(playerId, {
        action: "set_text",
        uid: (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_TITLE_CHILD,
        text: `<col=7f0000>${quest.displayName}</col>`,
    });

    services.dialog.queueWidgetEvent(playerId, {
        action: "run_script",
        scriptId: SCRIPT_QUEST_JOURNAL_OVERVIEW_SETUP,
        args: [
            quest.dbrowId,
            overviewStartText,
            (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_CONTENT_OUTER_CHILD,
            (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_CONTENT_INNER_CHILD,
            (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_SCROLLBAR_CHILD,
            (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_SCROLL_CHILD,
            (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_LAYOUT_CONTAINER_CHILD,
            (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_CONTENT_HOST_CHILD,
            (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_DECOR_MODEL_CHILD,
            player.skillSystem.combatLevel,
        ],
    });

    services.dialog.queueWidgetEvent(playerId, {
        action: "set_flags_range",
        uid: (QUEST_JOURNAL_OVERVIEW_GROUP_ID << 16) | QJO_CONTENT_INNER_CHILD,
        fromSlot: 1,
        toSlot: 1,
        flags: OP1_TRANSMIT,
    });

    services.system.logger.info?.(
        `[quest-journal] Opened overview for player=${playerId} quest="${quest.displayName}" (id=${quest.questId}, dbrow=${quest.dbrowId})`,
    );
}
