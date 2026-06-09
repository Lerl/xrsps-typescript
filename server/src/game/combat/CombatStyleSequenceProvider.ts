// =============================================================================
// Provider Registration & Delegation
// =============================================================================
import { getProviderRegistry } from "../providers/ProviderRegistry";

export type CombatStyleSlot = 0 | 1 | 2 | 3;

export interface CombatStyleSequenceProvider {
    getMeleeAttackSequenceForCategory(
        weaponCategory: number | undefined,
        styleSlot: number | undefined,
    ): number | undefined;
}

export function registerCombatStyleSequenceProvider(provider: CombatStyleSequenceProvider): void {
    getProviderRegistry().combatStyleSequence = provider;
}

export function getCombatStyleSequenceProvider(): CombatStyleSequenceProvider | undefined {
    return getProviderRegistry().combatStyleSequence;
}

function ensureProvider(): CombatStyleSequenceProvider {
    const p = getProviderRegistry().combatStyleSequence;
    if (!p) {
        throw new Error(
            "[CombatStyleSequences] CombatStyleSequenceProvider not registered. Ensure the gamemode has initialized.",
        );
    }
    return p;
}

export function getMeleeAttackSequenceForCategory(
    weaponCategory: number | undefined,
    styleSlot: number | undefined,
): number | undefined {
    return ensureProvider().getMeleeAttackSequenceForCategory(weaponCategory, styleSlot);
}
