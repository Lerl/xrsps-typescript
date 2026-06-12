// =============================================================================
// Provider Registration & Delegation
// =============================================================================
import { getProviderRegistry } from "../providers/ProviderRegistry";
import type { AttackType } from "./AttackType";

export type { AttackType } from "./AttackType";

// Types

export interface EquipmentBonusResult {
    accuracyMultiplier: number;
    damageMultiplier: number;
    /**
     * Multiplier applied to the attacker's effective accuracy level (floored)
     * before the attack roll, e.g. void. Distinct from accuracyMultiplier,
     * which scales the final attack roll.
     */
    accuracyLevelMultiplier: number;
    /**
     * Multiplier applied to the attacker's effective strength level (floored)
     * before the max-hit formula, e.g. void.
     */
    strengthLevelMultiplier: number;
    maxHitBonus: number;
    notes: string[];
    damageProcs?: Array<{ type: "keris"; chance: number; multiplier: number }>;
    tumekenMagicAttackMultiplier?: number;
    tumekenMagicDamageMultiplier?: number;
}

export interface SlayerTaskInfo {
    onTask: boolean;
    monsterName?: string;
    monsterSpecies?: string[];
}

export interface TargetInfo {
    species: string[];
    magicLevel?: number;
    isUndead: boolean;
    isDemon: boolean;
    isDragon: boolean;
    isKalphite: boolean;
}

// =============================================================================
// Provider Interface
// =============================================================================

export interface EquipmentBonusProvider {
    calculateEquipmentBonuses(
        equipment: number[],
        attackType: AttackType,
        target: TargetInfo,
        slayerTask: SlayerTaskInfo,
        playerHp: number,
        playerMaxHp: number,
        playerMagicLevel?: number,
        spellId?: number,
        isInsideToA?: boolean,
    ): EquipmentBonusResult;

    isTumekensShadow(weaponId: number): boolean;

    applyTumekenMagicAttackBonus(
        baseMagicAttackBonus: number,
        tumekenMultiplier: number | undefined,
    ): number;

    applyTumekenMagicDamageBonus(
        baseMagicDamagePercent: number,
        tumekenMultiplier: number | undefined,
    ): number;

    shouldUseSalveOverSlayer(
        equipment: number[],
        target: TargetInfo,
        slayerTask: SlayerTaskInfo,
    ): boolean;

    hasVeracSet(equipment: number[]): boolean;

    hasAhrimsDamnedSet(equipment: number[]): boolean;
}

// =============================================================================

// =============================================================================

export function registerEquipmentBonusProvider(provider: EquipmentBonusProvider): void {
    getProviderRegistry().equipmentBonus = provider;
}

export function getEquipmentBonusProvider(): EquipmentBonusProvider | undefined {
    return getProviderRegistry().equipmentBonus;
}

function ensureProvider(): EquipmentBonusProvider {
    const p = getProviderRegistry().equipmentBonus;
    if (!p) {
        throw new Error(
            "[EquipmentBonuses] EquipmentBonusProvider not registered. Ensure the gamemode has initialized.",
        );
    }
    return p;
}

export function calculateEquipmentBonuses(
    equipment: number[],
    attackType: AttackType,
    target: TargetInfo,
    slayerTask: SlayerTaskInfo,
    playerHp: number,
    playerMaxHp: number,
    playerMagicLevel: number = 99,
    spellId?: number,
    isInsideToA: boolean = false,
): EquipmentBonusResult {
    return ensureProvider().calculateEquipmentBonuses(
        equipment,
        attackType,
        target,
        slayerTask,
        playerHp,
        playerMaxHp,
        playerMagicLevel,
        spellId,
        isInsideToA,
    );
}

export function isTumekensShadow(weaponId: number): boolean {
    return ensureProvider().isTumekensShadow(weaponId);
}

export function applyTumekenMagicAttackBonus(
    baseMagicAttackBonus: number,
    tumekenMultiplier: number | undefined,
): number {
    return ensureProvider().applyTumekenMagicAttackBonus(baseMagicAttackBonus, tumekenMultiplier);
}

export function applyTumekenMagicDamageBonus(
    baseMagicDamagePercent: number,
    tumekenMultiplier: number | undefined,
): number {
    return ensureProvider().applyTumekenMagicDamageBonus(baseMagicDamagePercent, tumekenMultiplier);
}

export function shouldUseSalveOverSlayer(
    equipment: number[],
    target: TargetInfo,
    slayerTask: SlayerTaskInfo,
): boolean {
    return ensureProvider().shouldUseSalveOverSlayer(equipment, target, slayerTask);
}

export function hasVeracSet(equipment: number[]): boolean {
    return ensureProvider().hasVeracSet(equipment);
}

export function hasAhrimsDamnedSet(equipment: number[]): boolean {
    return ensureProvider().hasAhrimsDamnedSet(equipment);
}
