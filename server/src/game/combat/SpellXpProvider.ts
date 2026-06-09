import { getProviderRegistry } from "../providers/ProviderRegistry";

/**
 * Spell Base XP Provider
 *
 * Core provider interface for spell base XP lookup.
 * Gamemodes register their spell XP data at startup.
 */

export interface SpellXpProvider {
    getSpellBaseXp(spellId: number): number;
}

export function registerSpellXpProvider(provider: SpellXpProvider): void {
    getProviderRegistry().spellXp = provider;
}

export function getSpellBaseXp(spellId: number): number {
    return getProviderRegistry().spellXp?.getSpellBaseXp(spellId) ?? 0;
}
