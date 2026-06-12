import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import type { QuestDefinition, QuestItemRequirement } from "./types";

// ============================================================================
// Quest state, reward and completion handling
// ============================================================================

/** Varp: current quest points */
export const VARP_QUEST_POINTS = 101;

/** Quest completed scroll interface */
const QUEST_COMPLETED_GROUP_ID = 153;
/** Headline: "Congratulations!" */
const QC_TITLE_CHILD = 3;
/** Quest name line: "You have completed ..." */
const QC_NAME_CHILD = 4;
/** Reward item model */
const QC_REWARD_MODEL_CHILD = 5;
/** "Quest points: N" footer */
const QC_QUEST_POINTS_CHILD = 6;
/** First of eight reward list lines */
const QC_FIRST_REWARD_LINE_CHILD = 8;
const QC_REWARD_LINE_COUNT = 8;
/** Close button layer (cache op1 "Close"; the graphic child 17 stays click-through) */
const QC_CLOSE_LAYER_CHILD = 16;

/** quest_complete_1 */
const QUEST_COMPLETE_JINGLE_ID = 152;

// ============================================================================
// Quest stage state (varp-backed)
// ============================================================================

export function getQuestStage(player: PlayerState, quest: QuestDefinition): number {
    return player.varps.getVarpValue(quest.varpId);
}

export function setQuestStage(
    player: PlayerState,
    quest: QuestDefinition,
    services: ScriptServices,
    value: number,
): void {
    player.varps.setVarpValue(quest.varpId, value);
    services.variables.sendVarp(player, quest.varpId, value);
}

export function isQuestStarted(player: PlayerState, quest: QuestDefinition): boolean {
    return getQuestStage(player, quest) >= quest.startedValue;
}

export function isQuestComplete(player: PlayerState, quest: QuestDefinition): boolean {
    return getQuestStage(player, quest) >= quest.completionValue;
}

// ============================================================================
// Quest item requirements
// ============================================================================

export function countCarriedItem(
    player: PlayerState,
    services: ScriptServices,
    itemId: number,
): number {
    let total = 0;
    for (const entry of services.inventory.getInventoryItems(player)) {
        if (entry.itemId === itemId) total += entry.quantity;
    }
    return total;
}

export function hasQuestItems(
    player: PlayerState,
    services: ScriptServices,
    requirements: QuestItemRequirement[],
): boolean {
    return requirements.every(
        (req) => countCarriedItem(player, services, req.itemId) >= req.quantity,
    );
}

/** Remove all required items from the inventory. All-or-nothing. */
export function takeQuestItems(
    player: PlayerState,
    services: ScriptServices,
    requirements: QuestItemRequirement[],
): boolean {
    if (!hasQuestItems(player, services, requirements)) return false;
    for (const req of requirements) {
        let remaining = req.quantity;
        while (remaining > 0) {
            const slot = services.inventory.findInventorySlotWithItem(player, req.itemId);
            if (slot === undefined || !services.inventory.consumeItem(player, slot)) {
                services.inventory.snapshotInventory(player);
                return false;
            }
            remaining--;
        }
    }
    services.inventory.snapshotInventory(player);
    return true;
}

// ============================================================================
// Quest completion
// ============================================================================

export function completeQuest(
    player: PlayerState,
    services: ScriptServices,
    quest: QuestDefinition,
): void {
    setQuestStage(player, quest, services, quest.completionValue);

    const questPointTotal =
        player.varps.getVarpValue(VARP_QUEST_POINTS) + quest.rewards.questPoints;
    player.varps.setVarpValue(VARP_QUEST_POINTS, questPointTotal);
    services.variables.sendVarp(player, VARP_QUEST_POINTS, questPointTotal);

    for (const xp of quest.rewards.xp ?? []) {
        services.skills.addSkillXp(player, xp.skillId, xp.amount);
    }
    const itemRewards = quest.rewards.items ?? [];
    if (itemRewards.length > 0) {
        for (const item of itemRewards) {
            services.inventory.addItemToInventory(player, item.itemId, item.quantity);
        }
        services.inventory.snapshotInventory(player);
    }

    services.sound.sendJingle(player, QUEST_COMPLETE_JINGLE_ID);
    services.messaging.sendGameMessage(
        player,
        `Congratulations, you've completed a quest: ${quest.name}`,
    );
    openQuestCompletedScroll(player, services, quest, questPointTotal);

    services.system.logger.info?.(
        `[quests] Quest completed player=${player.id} quest="${quest.name}" qp=${questPointTotal}`,
    );
}

function buildRewardLines(quest: QuestDefinition): string[] {
    const lines = ["You are awarded:"];
    const qp = quest.rewards.questPoints;
    lines.push(`${qp} Quest Point${qp === 1 ? "" : "s"}`);
    for (const xp of quest.rewards.xp ?? []) {
        lines.push(`${xp.amount.toLocaleString("en-US")} ${xp.label} XP`);
    }
    for (const item of quest.rewards.items ?? []) {
        lines.push(item.label);
    }
    lines.push(...(quest.rewards.other ?? []));
    return lines.slice(0, QC_REWARD_LINE_COUNT);
}

function openQuestCompletedScroll(
    player: PlayerState,
    services: ScriptServices,
    quest: QuestDefinition,
    questPointTotal: number,
): void {
    services.dialog.closeDialog(player);

    const mainmodalUid = services.viewport.getMainmodalUid(player.displayMode ?? 1);
    services.dialog.openSubInterface(player, mainmodalUid, QUEST_COMPLETED_GROUP_ID, 0);

    const OP1_TRANSMIT = 1 << 1;
    services.dialog.queueWidgetEvent(player.id, {
        action: "set_flags_range",
        uid: (QUEST_COMPLETED_GROUP_ID << 16) | QC_CLOSE_LAYER_CHILD,
        fromSlot: -1,
        toSlot: -1,
        flags: OP1_TRANSMIT,
    });

    const setText = (childId: number, text: string) => {
        services.dialog.queueWidgetEvent(player.id, {
            action: "set_text",
            uid: (QUEST_COMPLETED_GROUP_ID << 16) | childId,
            text,
        });
    };

    setText(QC_TITLE_CHILD, "Congratulations!");
    setText(QC_NAME_CHILD, `You have completed ${quest.name}!`);

    if (quest.rewardItemId !== undefined) {
        services.dialog.queueWidgetEvent(player.id, {
            action: "set_item",
            uid: (QUEST_COMPLETED_GROUP_ID << 16) | QC_REWARD_MODEL_CHILD,
            itemId: quest.rewardItemId,
            quantity: 1,
        });
    }

    const rewardLines = buildRewardLines(quest);
    for (let i = 0; i < QC_REWARD_LINE_COUNT; i++) {
        setText(QC_FIRST_REWARD_LINE_CHILD + i, rewardLines[i] ?? "");
    }

    setText(QC_QUEST_POINTS_CHILD, `Quest points: ${questPointTotal}`);
}

export function registerQuestCompletedWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    const close = (event: { player: PlayerState }) => {
        services.dialog.closeModal(event.player);
    };
    registry.onButton(QUEST_COMPLETED_GROUP_ID, QC_CLOSE_LAYER_CHILD, close);
}
