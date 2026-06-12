import type { QuestDefinition } from "./types";

// ============================================================================
// Quest registry
//
// Maps quest display names (as stored in the cache quest DB) to their server
// definitions. The quest journal widget consults this to render stage-specific
// journal text for implemented quests.
// ============================================================================

const questsByName = new Map<string, QuestDefinition>();

export function registerQuestDefinition(quest: QuestDefinition): void {
    questsByName.set(quest.name.toLowerCase(), quest);
}

export function getQuestDefinition(displayName: string): QuestDefinition | undefined {
    return questsByName.get(displayName.toLowerCase());
}

export function getRegisteredQuests(): QuestDefinition[] {
    return [...questsByName.values()];
}
