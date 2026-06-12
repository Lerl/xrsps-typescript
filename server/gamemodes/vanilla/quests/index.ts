import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { registerQuestDefinition } from "./QuestRegistry";
import { registerQuestCompletedWidgetHandlers } from "./QuestService";
import { doricsQuest } from "./definitions/doricsQuest";
import type { QuestDefinition } from "./types";

const QUEST_DEFINITIONS: QuestDefinition[] = [doricsQuest];

/**
 * Register all implemented quests: their interaction handlers, the shared
 * quest-completed scroll widget, and the registry consulted by the quest
 * journal for stage-specific text.
 *
 * Must run after skill handlers so quest gates can wrap skill loc handlers
 * (e.g. Doric's anvils wrapping the generic smith action).
 */
export function registerQuestHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    registerQuestCompletedWidgetHandlers(registry, services);
    for (const quest of QUEST_DEFINITIONS) {
        registerQuestDefinition(quest);
        quest.register(registry, services);
    }
    services.system.logger.info?.(`[quests] Registered ${QUEST_DEFINITIONS.length} quest(s)`);
}

export { getQuestDefinition, getRegisteredQuests } from "./QuestRegistry";
export type { QuestDefinition, QuestItemRequirement, QuestRewards } from "./types";
