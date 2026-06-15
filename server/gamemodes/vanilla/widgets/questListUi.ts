import {
    QUEST_LIST_ENTRY_EVENT_FLAGS,
    QUEST_LIST_ENTRY_LIST_UID,
} from "../../../../src/shared/ui/sideJournal";
import {
    QUEST_LIST_STATUS_COMPLETE,
    QUEST_LIST_STATUS_IN_PROGRESS,
    QUEST_LIST_STATUS_NOT_STARTED,
    buildQuestListWidgetGroups,
    getQuestListWidgetMaxSlot,
    type QuestListConfigGroup,
    type QuestListConfigQuest,
    type QuestListStatus,
    type QuestListWidgetGroup,
} from "../../../../src/shared/ui/questList";
import type {
    GamemodeQuestListGroup,
    GamemodeQuestListQuest,
    GamemodeUiBridge,
} from "../../../src/game/gamemodes/GamemodeDefinition";
import type { PlayerState } from "../../../src/game/player";
import type { WidgetAction } from "../../../src/widgets/WidgetManager";
import type { QuestDefinition } from "../quests/types";
import {
    getQuestDefinitionByKey,
    getQuestDefinitionByName,
    normalizeQuestKey,
} from "../quests/QuestRegistry";
import { getQuestCompletionInfo } from "./questListData";

type QuestListBridge = Pick<GamemodeUiBridge, "queueWidgetEvent">;

interface ResolvedQuestListQuest {
    key: string;
    displayName: string;
    definition?: QuestDefinition;
}

function getQuestRefKey(ref: string | GamemodeQuestListQuest): string {
    if (typeof ref === "string") return ref;
    return ref.key;
}

function resolveQuestListQuest(
    ref: string | GamemodeQuestListQuest,
): ResolvedQuestListQuest | undefined {
    const rawKey = getQuestRefKey(ref).trim();
    if (rawKey.length === 0) return undefined;

    const definition = getQuestDefinitionByKey(rawKey) ?? getQuestDefinitionByName(rawKey);
    if (definition) {
        return {
            key: definition.key,
            displayName: definition.name,
            definition,
        };
    }

    return {
        key: normalizeQuestKey(rawKey),
        displayName: rawKey,
    };
}

function getQuestStatus(player: PlayerState, quest: ResolvedQuestListQuest): QuestListStatus {
    const definition = quest.definition;
    if (definition) {
        const stage = player.varps.getVarpValue(definition.varpId);
        if (stage >= definition.completionValue) return QUEST_LIST_STATUS_COMPLETE;
        if (stage >= definition.startedValue) return QUEST_LIST_STATUS_IN_PROGRESS;
        return QUEST_LIST_STATUS_NOT_STARTED;
    }

    const completionEntry = getQuestCompletionInfo(quest.displayName);
    if (!completionEntry) return QUEST_LIST_STATUS_NOT_STARTED;

    if (completionEntry.varpId >= 0) {
        const currentValue = player.varps.getVarpValue(completionEntry.varpId);
        return currentValue >= completionEntry.completionValue
            ? QUEST_LIST_STATUS_COMPLETE
            : QUEST_LIST_STATUS_NOT_STARTED;
    }

    if (completionEntry.varbitEntries) {
        for (const { varbitId, value } of completionEntry.varbitEntries) {
            if (player.varps.getVarbitValue(varbitId) < value) {
                return QUEST_LIST_STATUS_NOT_STARTED;
            }
        }
        return QUEST_LIST_STATUS_COMPLETE;
    }

    return QUEST_LIST_STATUS_NOT_STARTED;
}

function getConfiguredGroups(player: PlayerState): readonly GamemodeQuestListGroup[] {
    return player.gamemode.getQuestListGroups?.(player) ?? [];
}

export function buildPlayerQuestListWidgetGroups(
    player: PlayerState,
    configuredGroups: readonly GamemodeQuestListGroup[] = getConfiguredGroups(player),
): QuestListWidgetGroup[] {
    const groups: QuestListConfigGroup[] = [];
    for (const group of configuredGroups) {
        const quests = Array.isArray(group.quests) ? group.quests : [];
        const resolvedQuests: QuestListConfigQuest[] = [];
        for (const questRef of quests) {
            const quest = resolveQuestListQuest(questRef);
            if (!quest) continue;
            resolvedQuests.push({
                key: quest.key,
                displayName: quest.displayName,
                status: getQuestStatus(player, quest),
            });
        }
        groups.push({
            title: group.title,
            quests: resolvedQuests,
        });
    }
    return buildQuestListWidgetGroups(groups);
}

export function findPlayerQuestListQuestBySlot(
    player: PlayerState,
    slot: number | undefined,
): QuestListWidgetGroup["quests"][number] | undefined {
    if (slot === undefined || slot < 0) return undefined;

    const groups = buildPlayerQuestListWidgetGroups(player);
    for (const group of groups) {
        for (const quest of group.quests) {
            if (quest.slot === slot) return quest;
        }
    }
    return undefined;
}

export function queuePlayerQuestListUi(
    player: PlayerState,
    bridge: QuestListBridge,
    configuredGroups?: readonly GamemodeQuestListGroup[],
): QuestListWidgetGroup[] {
    const groups = buildPlayerQuestListWidgetGroups(player, configuredGroups);
    const maxSlot = getQuestListWidgetMaxSlot(groups);

    bridge.queueWidgetEvent(player.id, {
        action: "set_quest_list",
        groups,
    } satisfies WidgetAction);

    if (maxSlot >= 0) {
        bridge.queueWidgetEvent(player.id, {
            action: "set_flags_range",
            uid: QUEST_LIST_ENTRY_LIST_UID,
            fromSlot: 0,
            toSlot: maxSlot,
            flags: QUEST_LIST_ENTRY_EVENT_FLAGS,
        });
    }

    return groups;
}
