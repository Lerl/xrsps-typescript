import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";

// ============================================================================
// Quest framework types
// ============================================================================

export interface QuestItemRequirement {
    itemId: number;
    quantity: number;
    /** Label shown in the quest journal (e.g. "6 Clay") */
    journalLabel: string;
}

export interface QuestXpReward {
    skillId: number;
    amount: number;
    /** Skill name shown on the completion scroll (e.g. "Mining") */
    label: string;
}

export interface QuestItemReward {
    itemId: number;
    quantity: number;
    /** Label shown on the completion scroll (e.g. "180 Coins") */
    label: string;
}

export interface QuestRewards {
    questPoints: number;
    xp?: QuestXpReward[];
    items?: QuestItemReward[];
    /** Reward lines with no direct grant (e.g. "Use of Doric's anvils") */
    other?: string[];
}

export interface QuestDefinition {
    /** Stable content key used by gamemodes and server systems */
    key: string;
    /** Display name exactly as it appears in the cache quest DB (table 0) */
    name: string;
    /** Quest progress varp */
    varpId: number;
    /** Varp value once the quest has been started */
    startedValue: number;
    /** Varp value once the quest is complete */
    completionValue: number;
    rewards: QuestRewards;
    /** Item model shown on the completion scroll (153:5) */
    rewardItemId?: number;
    /** Start text fragment shown by the quest overview. */
    overviewStartText?: string;
    /** Build the quest journal lines for the player's current stage */
    buildJournal(player: PlayerState, services: ScriptServices): string[];
    /** Register the quest's interaction handlers (NPCs, locs, items) */
    register(registry: IScriptRegistry, services: ScriptServices): void;
}
