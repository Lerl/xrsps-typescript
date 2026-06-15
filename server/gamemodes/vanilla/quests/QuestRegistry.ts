import type { QuestDefinition } from "./types";

// ============================================================================
// Quest registry
//
// Maps quest display names (as stored in the cache quest DB) to their server
// definitions. The quest journal widget consults this to render stage-specific
// journal text for implemented quests.
// ============================================================================

const questsByKey = new Map<string, QuestDefinition>();
const questsByName = new Map<string, QuestDefinition>();

export function normalizeQuestKey(key: string): string {
    return String(key ?? "").trim().toLowerCase();
}

function normalizeQuestName(name: string): string {
    return String(name ?? "").trim().toLowerCase();
}

export function registerQuestDefinition(quest: QuestDefinition): void {
    const key = normalizeQuestKey(quest.key);
    const name = normalizeQuestName(quest.name);
    if (key.length > 0) questsByKey.set(key, quest);
    if (name.length > 0) questsByName.set(name, quest);
}

export function getQuestDefinitionByKey(key: string): QuestDefinition | undefined {
    return questsByKey.get(normalizeQuestKey(key));
}

export function getQuestDefinitionByName(displayName: string): QuestDefinition | undefined {
    return questsByName.get(normalizeQuestName(displayName));
}

export function getQuestDefinition(ref: string): QuestDefinition | undefined {
    return getQuestDefinitionByKey(ref) ?? getQuestDefinitionByName(ref);
}

export function getRegisteredQuests(): QuestDefinition[] {
    return [...questsByName.values()];
}
