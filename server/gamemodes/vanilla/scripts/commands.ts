import { getAllTeleportSpells } from "../../../src/data/teleportDestinations";
import {
    getRuneDataProvider,
    type RuneId,
} from "../../../src/game/data/RuneDataProvider";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { getAllSpellData } from "../../../src/game/spells/SpellDataProvider";

const DEFAULT_MAGIC_RUNE_QUANTITY = 10_000;
const MAX_MAGIC_RUNE_QUANTITY = 2_000_000_000;

const COMBINATION_RUNE_KEYS = new Set<keyof RuneId>([
    "MIST",
    "DUST",
    "MUD",
    "SMOKE",
    "STEAM",
    "LAVA",
]);

type RuneCost = {
    runeId: number;
    quantity: number;
};

function parsePositiveQuantity(value: string | undefined): number | undefined {
    if (value === undefined) return DEFAULT_MAGIC_RUNE_QUANTITY;

    const quantity = Math.floor(Number.parseInt(value, 10));
    if (!Number.isFinite(quantity) || quantity <= 0) return undefined;
    return Math.min(quantity, MAX_MAGIC_RUNE_QUANTITY);
}

function getBaseRuneItemIds(): number[] {
    const provider = getRuneDataProvider();
    if (!provider) return [];

    const runeIds = provider.getRuneIds();
    return Object.entries(runeIds)
        .filter(([key]) => !COMBINATION_RUNE_KEYS.has(key as keyof RuneId))
        .map(([, itemId]) => itemId)
        .filter((itemId) => itemId > 0);
}

function collectRuneCosts(
    runeCosts: readonly RuneCost[] | undefined,
    runeItemIds: ReadonlySet<number>,
    out: Set<number>,
): void {
    if (!Array.isArray(runeCosts)) return;

    for (const cost of runeCosts) {
        if (runeItemIds.has(cost.runeId)) {
            out.add(cost.runeId);
        }
    }
}

function getMagicRuneItemIds(): number[] {
    const baseRuneIds = getBaseRuneItemIds();
    const baseRuneSet = new Set(baseRuneIds);
    const requiredRuneIds = new Set(baseRuneIds);

    for (const spell of getAllSpellData()) {
        collectRuneCosts(spell.runeCosts, baseRuneSet, requiredRuneIds);
    }

    for (const teleport of getAllTeleportSpells()) {
        collectRuneCosts(teleport.runeCosts, baseRuneSet, requiredRuneIds);
    }

    return baseRuneIds.filter((itemId) => requiredRuneIds.has(itemId));
}

function getMissingRuneSlotCount(player: PlayerState, runeItemIds: readonly number[]): number {
    const inventory = player.items.getInventoryEntries();
    const carriedItemIds = new Set(
        inventory
            .filter((entry) => entry.itemId > 0 && entry.quantity > 0)
            .map((entry) => entry.itemId),
    );

    let missingSlots = 0;
    for (const itemId of runeItemIds) {
        if (!carriedItemIds.has(itemId)) {
            missingSlots++;
        }
    }
    return missingSlots;
}

function getFreeInventorySlotCount(player: PlayerState): number {
    return player.items.getFreeSlotCount();
}

export function registerVanillaCommandHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registry.registerCommand("magic", ({ player, args }) => {
        const quantity = parsePositiveQuantity(args[0]);
        if (quantity === undefined) {
            return "Usage: ::magic [quantity]";
        }

        const runeItemIds = getMagicRuneItemIds();
        if (runeItemIds.length === 0) {
            return "No magic rune data is available.";
        }

        const missingSlots = getMissingRuneSlotCount(player, runeItemIds);
        const freeSlots = getFreeInventorySlotCount(player);
        if (missingSlots > freeSlots) {
            return `You need ${missingSlots - freeSlots} more free inventory slot(s) for ::magic.`;
        }

        const added: Array<{ itemId: number; quantity: number }> = [];
        for (const itemId of runeItemIds) {
            const result = services.inventory.addItemToInventory(player, itemId, quantity);
            if (result.added !== quantity) {
                for (const grant of added) {
                    player.items.removeItem(grant.itemId, grant.quantity, {
                        assureFullRemoval: false,
                    });
                }
                services.inventory.snapshotInventory(player);
                return "Unable to add the full ::magic rune kit.";
            }
            added.push({ itemId, quantity });
        }

        services.inventory.snapshotInventory(player);
        services.system.logger.info(
            `[cmd] ::magic - Gave player ${player.id} ${runeItemIds.length} rune types x${quantity}`,
        );
        return `Added ${runeItemIds.length} spell rune types x${quantity}.`;
    });
}
