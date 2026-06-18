/**
 * OSRS Spell Base XP Data
 * Reference: https://oldschool.runescape.wiki/w/Magic#Experience
 *
 * Magic XP is calculated as:
 * - Base XP from casting the spell (awarded even on splash)
 * - Plus 2 XP per damage dealt (only on hit)
 *
 * For combat XP calculation, we only use the base XP here.
 * The damage-based XP (2 per damage) is added in CombatXp.ts
 */
import type { SpellXpProvider } from "../../../src/game/combat/SpellXpProvider";

// Standard Spellbook - Combat Spells
// Values from OSRS Wiki as of 2024

export const SPELL_BASE_XP: Record<number, number> = {
    // Strike Spells
    3273: 5.5, // Wind Strike
    1152: 5.5, // Wind Strike
    3275: 7.5, // Water Strike
    1154: 7.5, // Water Strike
    3277: 9.5, // Earth Strike
    1156: 9.5, // Earth Strike
    3279: 11.5, // Fire Strike
    1158: 11.5, // Fire Strike

    // Bolt Spells
    3281: 13.5, // Wind Bolt
    1160: 13.5, // Wind Bolt
    3285: 16.5, // Water Bolt
    1163: 16.5, // Water Bolt
    3288: 19.5, // Earth Bolt
    1166: 19.5, // Earth Bolt
    3291: 22.5, // Fire Bolt
    1169: 22.5, // Fire Bolt

    // Blast Spells
    3294: 25.5, // Wind Blast
    1172: 25.5, // Wind Blast
    3297: 28.5, // Water Blast
    1175: 28.5, // Water Blast
    3302: 31.5, // Earth Blast
    1177: 31.5, // Earth Blast
    3307: 34.5, // Fire Blast
    1181: 34.5, // Fire Blast

    // Wave Spells
    3313: 36, // Wind Wave
    1183: 36, // Wind Wave
    3315: 37.5, // Water Wave
    1185: 37.5, // Water Wave
    3319: 40, // Earth Wave
    1188: 40, // Earth Wave
    3321: 42.5, // Fire Wave
    1189: 42.5, // Fire Wave

    // Surge Spells
    21876: 44.5, // Wind Surge
    22644: 44.5, // Wind Surge
    21877: 46.5, // Water Surge
    22658: 46.5, // Water Surge
    21878: 48.5, // Earth Surge
    22628: 48.5, // Earth Surge
    21879: 50.5, // Fire Surge
    22608: 50.5, // Fire Surge

    // God Spells (requires charge)
    3310: 35, // Saradomin Strike
    1190: 35, // Saradomin Strike
    3311: 35, // Claws of Guthix
    1191: 35, // Claws of Guthix
    3312: 35, // Flames of Zamorak
    1192: 35, // Flames of Zamorak

    // Crumble Undead
    3293: 24.5, // Crumble Undead
    1171: 24.5,

    // Iban Blast
    3309: 30, // Iban Blast
    1539: 30,

    // Magic Dart
    4176: 30, // Magic Dart
    12037: 30,

    // Ancient Magicks - Rush Spells
    4629: 30, // Smoke Rush
    12939: 30, // Smoke Rush
    4630: 31, // Shadow Rush
    12987: 31, // Shadow Rush
    4632: 33, // Blood Rush
    12901: 33, // Blood Rush
    4633: 34, // Ice Rush
    12861: 34, // Ice Rush

    // Ancient Magicks - Burst Spells
    4635: 36, // Smoke Burst
    12963: 36, // Smoke Burst
    4636: 37, // Shadow Burst
    13011: 37, // Shadow Burst
    4638: 39, // Blood Burst
    12919: 39, // Blood Burst
    4639: 40, // Ice Burst
    12881: 40, // Ice Burst

    // Ancient Magicks - Blitz Spells
    4641: 42, // Smoke Blitz
    12951: 42, // Smoke Blitz
    4642: 43, // Shadow Blitz
    12999: 43, // Shadow Blitz
    4644: 45, // Blood Blitz
    12911: 45, // Blood Blitz
    4645: 46, // Ice Blitz
    12871: 46, // Ice Blitz

    // Ancient Magicks - Barrage Spells
    4647: 48, // Smoke Barrage
    12975: 48, // Smoke Barrage
    4648: 49, // Shadow Barrage
    13023: 49, // Shadow Barrage
    4650: 51, // Blood Barrage
    12929: 51, // Blood Barrage
    4651: 52, // Ice Barrage
    12891: 52, // Ice Barrage

    // Arceuus Spellbook - Combat
    20398: 45, // Inferior Demonbane
    22146: 45, // Inferior Demonbane
    20399: 62.5, // Superior Demonbane
    22153: 62.5, // Superior Demonbane
    20400: 82.5, // Dark Demonbane
    22161: 82.5, // Dark Demonbane
    21826: 60, // Ghostly Grasp
    22337: 60, // Ghostly Grasp
    21829: 72, // Skeletal Grasp
    22351: 72, // Skeletal Grasp
    21832: 87, // Undead Grasp
    22365: 87, // Undead Grasp
};

/**
 * Get the base XP for a spell.
 * This is the XP awarded for casting the spell (even on splash).
 *
 * @param spellId - The spell ID (varbit/config ID)
 * @returns Base XP for the spell, or 0 if unknown
 */
export function getSpellBaseXp(spellId: number): number {
    return SPELL_BASE_XP[spellId] ?? 0;
}

/**
 * Check if a spell ID is a known combat spell.
 *
 * @param spellId - The spell ID to check
 * @returns True if this is a known combat spell
 */
export function isCombatSpell(spellId: number): boolean {
    return spellId in SPELL_BASE_XP;
}

export function createSpellXpProvider(): SpellXpProvider {
    return { getSpellBaseXp };
}
