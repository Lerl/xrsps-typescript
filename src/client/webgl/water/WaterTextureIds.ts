// 117HD water material coverage for legacy OSRS water plus the Sailing water bank.
// Texture 17 is water droplets in 117HD, not terrain water.
export const KNOWN_WATER_TEXTURE_IDS = new Set<number>([
    1,
    24,
    25,
    91,
    ...Array.from({ length: 60 }, (_, index) => 129 + index),
]);

export function isKnownWaterTextureId(textureId: number): boolean {
    return KNOWN_WATER_TEXTURE_IDS.has(textureId);
}
