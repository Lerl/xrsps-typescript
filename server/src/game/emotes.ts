// Emote tab (interface 216) data, indexed by emote slot (enum 1000 order).
// Loop availability mirrors enum 4998 (every loopable emote has a dedicated
// *_loop sequence in the cache); loopFirst mirrors enum 4999 (Loop is op1 and
// Perform is op2 for those emotes).

export interface EmoteDefinition {
    name: string;
    /** Base (Perform) sequence. Omitted for Skill Cape (43), derived from the worn cape. */
    seqId?: number;
    /** Alternate Perform sequences cycled per use (e.g. Crazy dance). */
    variantSeqIds?: number[];
    /** Loop sequence; present exactly for emotes flagged in enum 4998. */
    loopSeqId?: number;
    /** Loop is the primary option (op1) and Perform is op2 (enum 4999). */
    loopFirst?: boolean;
}

export const EMOTE_DEFINITIONS: Partial<Record<number, EmoteDefinition>> = {
    0: { name: "Yes", seqId: 855, loopSeqId: 189 },
    1: { name: "No", seqId: 856, loopSeqId: 190 },
    2: { name: "Bow", seqId: 858, loopSeqId: 192 },
    3: { name: "Angry", seqId: 859, loopSeqId: 193 },
    4: { name: "Think", seqId: 857, loopSeqId: 191 },
    5: { name: "Wave", seqId: 863, loopSeqId: 197 },
    6: { name: "Shrug", seqId: 2113, loopSeqId: 12056 },
    7: { name: "Cheer", seqId: 862, loopSeqId: 196 },
    8: { name: "Beckon", seqId: 864, loopSeqId: 2691 },
    9: { name: "Laugh", seqId: 861, loopSeqId: 195 },
    10: { name: "Jump for Joy", seqId: 2109, loopSeqId: 12051 },
    11: { name: "Yawn", seqId: 2111, loopSeqId: 12053 },
    12: { name: "Dance", seqId: 866, loopSeqId: 10048 },
    13: { name: "Jig", seqId: 2106, loopSeqId: 10049 },
    14: { name: "Spin", seqId: 2107, loopSeqId: 12085 },
    15: { name: "Headbang", seqId: 2108, loopSeqId: 10050 },
    16: { name: "Cry", seqId: 860, loopSeqId: 194 },
    17: { name: "Blow Kiss", seqId: 1374, loopSeqId: 3803 },
    18: { name: "Panic", seqId: 2105, loopSeqId: 12050 },
    19: { name: "Raspberry", seqId: 2110, loopSeqId: 12052 },
    20: { name: "Clap", seqId: 865, loopSeqId: 3193 },
    21: { name: "Salute", seqId: 2112, loopSeqId: 12055 },
    22: { name: "Goblin Bow", seqId: 2127, loopSeqId: 12082 },
    23: { name: "Goblin Salute", seqId: 2128, loopSeqId: 12074 },
    24: { name: "Glass Box", seqId: 1131, loopSeqId: 12068 },
    25: { name: "Climb Rope", seqId: 1130, loopSeqId: 12067 },
    26: { name: "Lean", seqId: 1129, loopSeqId: 10062 },
    27: { name: "Glass Wall", seqId: 1128, loopSeqId: 12066 },
    28: { name: "Idea", seqId: 4276, loopSeqId: 12072 },
    29: { name: "Stamp", seqId: 4278, loopSeqId: 12080 },
    30: { name: "Flap", seqId: 4280, loopSeqId: 12073 },
    31: { name: "Slap Head", seqId: 4275, loopSeqId: 12071 },
    32: { name: "Zombie Walk", seqId: 3544, loopSeqId: 12070 },
    33: { name: "Zombie Dance", seqId: 3543, loopSeqId: 12069 },
    34: { name: "Scared", seqId: 2836, loopSeqId: 12075 },
    35: { name: "Rabbit Hop", seqId: 6111, loopSeqId: 12057 },
    36: { name: "Sit up", seqId: 874, loopSeqId: 12061 },
    37: { name: "Push up", seqId: 872, loopSeqId: 12060 },
    38: { name: "Star jump", seqId: 870, loopSeqId: 12059 },
    39: { name: "Jog", seqId: 868, loopSeqId: 12058 },
    40: { name: "Flex", seqId: 8917, loopSeqId: 12064 },
    41: { name: "Zombie Hand", seqId: 1708 },
    42: { name: "Hypermobile Drinker", seqId: 7131, loopSeqId: 12062 },
    43: { name: "Skill Cape" },
    44: { name: "Air Guitar", seqId: 4751 },
    45: { name: "Uri transform", seqId: 7278 },
    46: { name: "Smooth dance", seqId: 7533 },
    // Alternates between the two Gangnam Style dances each use. Shows a Loop
    // op (enum 4998) but no dedicated loop sequence exists in the cache, so a
    // Loop click advances the alternation like Perform.
    47: { name: "Crazy dance", seqId: 7536, variantSeqIds: [7536, 7537] },
    48: { name: "Premier Shield", seqId: 7751 },
    49: { name: "Explore", seqId: 8541, loopSeqId: 12063 },
    50: { name: "Relic unlock", seqId: 9208 },
    51: { name: "Party", seqId: 10031, loopSeqId: 12065 },
    52: { name: "Trick", seqId: 10503 },
    53: { name: "Fortis Salute", seqId: 10796, loopSeqId: 10797 },
    54: { name: "Sit down", seqId: 10053, loopSeqId: 10061, loopFirst: true },
    55: { name: "Crab dance", seqId: 10051, loopSeqId: 10052, loopFirst: true },
};

export function getEmoteDefinition(index: number): EmoteDefinition | undefined {
    return EMOTE_DEFINITIONS[index];
}

export function getEmoteSeq(index: number): number | undefined {
    const def = EMOTE_DEFINITIONS[index];
    const id = def?.seqId;
    if (id !== undefined && id >= 0) return id;
    return undefined;
}

// Round-robin state for emotes with alternating Perform sequences.
const variantCursor = new WeakMap<object, Map<number, number>>();

export interface EmotePlayback {
    seqId: number;
    loop: boolean;
}

/**
 * Resolve which sequence a click on the emote tab should play.
 * opId is the interface op (1 or 2); loop-first emotes have Loop as op1.
 * Returns undefined for unknown emotes and for emotes without a base
 * sequence here (Skill Cape derives its sequence from the worn cape).
 */
export function resolveEmotePlayback(
    index: number,
    opId: number,
    stateKey: object,
): EmotePlayback | undefined {
    const def = EMOTE_DEFINITIONS[index];
    if (!def) return undefined;

    const loopOpClicked = def.loopFirst ? opId === 1 : opId === 2;
    if (def.loopSeqId !== undefined && loopOpClicked) {
        return { seqId: def.loopSeqId, loop: true };
    }

    if (def.variantSeqIds && def.variantSeqIds.length > 0) {
        let cursors = variantCursor.get(stateKey);
        if (!cursors) {
            cursors = new Map();
            variantCursor.set(stateKey, cursors);
        }
        const cursor = cursors.get(index) ?? 0;
        cursors.set(index, (cursor + 1) % def.variantSeqIds.length);
        return { seqId: def.variantSeqIds[cursor], loop: false };
    }

    if (def.seqId === undefined || def.seqId < 0) return undefined;
    return { seqId: def.seqId, loop: false };
}
