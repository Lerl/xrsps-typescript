import { SkillId } from "../../../../../src/rs/skill/skills";
import type { PlayerState } from "../../../../src/game/player";
import type {
    IScriptRegistry,
    NpcInteractionEvent,
    ScriptServices,
} from "../../../../src/game/scripts/types";
import {
    completeQuest,
    countCarriedItem,
    getQuestStage,
    hasQuestItems,
    isQuestComplete,
    setQuestStage,
    takeQuestItems,
} from "../QuestService";
import { type DialogueContext, type DialogueStep, startConversation } from "../dialogue";
import type { QuestDefinition, QuestItemRequirement } from "../types";

// ============================================================================
// Doric's Quest
// ============================================================================

const DORIC_NPC_ID = 3893;

const VARP_DORICS_QUEST = 31;
const STAGE_STARTED = 10;
const STAGE_COMPLETE = 100;

const CLAY_ITEM_ID = 434;
const COPPER_ORE_ITEM_ID = 436;
const IRON_ORE_ITEM_ID = 440;
const COINS_ITEM_ID = 995;
const STEEL_PICKAXE_ITEM_ID = 1269;

const REQUIRED_ITEMS: QuestItemRequirement[] = [
    { itemId: CLAY_ITEM_ID, quantity: 6, journalLabel: "6 Clay" },
    { itemId: COPPER_ORE_ITEM_ID, quantity: 4, journalLabel: "4 Copper ore" },
    { itemId: IRON_ORE_ITEM_ID, quantity: 2, journalLabel: "2 Iron ore" },
];

/** Doric's anvils (loc 2031) inside his house north of Falador */
const DORIC_ANVIL_LOC_ID = 2031;
const DORIC_ANVIL_AREA = { minX: 2949, maxX: 2952, minY: 3450, maxY: 3453, level: 0 };

// ============================================================================
// Dialogue
// ============================================================================

const acceptSteps: DialogueStep[] = [
    {
        npc: [
            "Clay is what I use more than anything, to make",
            "casts. Could you get me 6 clay, 4 copper ore, and 2",
            "iron ore, please? I could pay a little, as well as",
            "letting you use my anvils.",
        ],
    },
    {
        exec: (ctx) => {
            setQuestStage(ctx.player, doricsQuest, ctx.services, STAGE_STARTED);
        },
    },
    { player: ["Certainly, I'll be right back!"] },
];

const anvilRequestSteps: DialogueStep[] = [
    {
        npc: [
            "My anvils get enough work with my own use. I",
            "make pickaxes, and it takes a lot of hammering to",
            "get them just right.",
        ],
    },
    {
        npc: [
            "But you could be some help to me; I'm running",
            "low on certain materials, and I could do with a",
            "hand collecting them.",
        ],
    },
    {
        npc: ["If you could fetch me what I need, I would be", "happy to let you use my anvils."],
    },
    {
        options: [
            { text: "Yes, I will get you the materials.", next: acceptSteps },
            {
                text: "No, hitting rocks is for the boring people, sorry.",
                next: [{ npc: ["That is your choice. Nice to meet you anyway."] }],
            },
        ],
    },
];

const notStartedSteps: DialogueStep[] = [
    { npc: ["Hello traveller, what brings you to my humble", "smithy?"] },
    {
        options: [
            { text: "I wanted to use your anvils.", next: anvilRequestSteps },
            {
                text: "Mind your own business, shortstuff!",
                next: [
                    {
                        npc: [
                            "How nice to meet someone with such pleasant",
                            "manners. Do come again when you need to shout",
                            "at someone smaller than you!",
                        ],
                    },
                ],
            },
            {
                text: "I was just checking out the landscape.",
                next: [
                    {
                        npc: [
                            "Hope you like it. I do enjoy the solitude of my",
                            "little home. If you get time, please say hello to",
                            "my friends in the Dwarven Mine.",
                        ],
                    },
                    { player: ["Dwarven Mine, eh?"] },
                    {
                        npc: [
                            "Yes, the entrance is in the side of Ice Mountain",
                            "just east of here. They're a friendly bunch.",
                        ],
                    },
                ],
            },
            {
                text: "What do you make here?",
                next: [
                    {
                        npc: [
                            "I make pickaxes. I am the best maker of pickaxes",
                            "in the whole of Gielinor.",
                        ],
                    },
                    { player: ["Do you have any pickaxes for sale?"] },
                    {
                        npc: [
                            "Sorry, but I've got a running order with the",
                            "dwarves of the Dwarven Mine.",
                        ],
                    },
                ],
            },
        ],
    },
];

function inProgressSteps(player: PlayerState, services: ScriptServices): DialogueStep[] {
    if (!hasQuestItems(player, services, REQUIRED_ITEMS)) {
        return [
            { npc: ["Have you got my materials yet, traveller?"] },
            { player: ["Sorry, I don't have them all yet."] },
            {
                npc: [
                    "Not to worry, stick at it. Remember, I need 6 clay,",
                    "4 copper ore, and 2 iron ore.",
                ],
            },
            { player: ["OK, I'll get on with it."] },
        ];
    }
    return [
        { npc: ["Have you got my materials yet, traveller?"] },
        { player: ["I have everything you need."] },
        {
            npc: [
                "Many thanks. Pass them here, please. I can spare",
                "you some coins for your trouble, and please use my",
                "anvils any time you want.",
            ],
        },
        {
            exec: (ctx) => {
                if (!takeQuestItems(ctx.player, ctx.services, REQUIRED_ITEMS)) {
                    ctx.services.messaging.sendGameMessage(
                        ctx.player,
                        "You don't have all the materials Doric needs.",
                    );
                    return;
                }
                completeQuest(ctx.player, ctx.services, doricsQuest);
            },
        },
    ];
}

const completedSteps: DialogueStep[] = [
    { npc: ["Hello traveller, how is your metalwork coming", "along?"] },
    { player: ["Not too bad, Doric."] },
    { npc: ["Good, the love of metal is a thing close to my", "heart."] },
];

function handleDoricTalk(event: NpcInteractionEvent): void {
    const { player, services } = event;
    const ctx: DialogueContext = { player, services, npcId: DORIC_NPC_ID, npcName: "Doric" };

    const stage = getQuestStage(player, doricsQuest);
    if (stage >= STAGE_COMPLETE) {
        startConversation(ctx, completedSteps);
    } else if (stage >= STAGE_STARTED) {
        startConversation(ctx, inProgressSteps(player, services));
    } else {
        startConversation(ctx, notStartedSteps);
    }
}

// ============================================================================
// Doric's anvils gate
// ============================================================================

function registerDoricAnvilGate(registry: IScriptRegistry, services: ScriptServices): void {
    // Capture the generic anvil handler before overriding it for this loc id.
    // Quests register after skills, so the smithing handler exists by now.
    const genericSmith = registry.findLocInteraction(DORIC_ANVIL_LOC_ID, "smith");
    if (!genericSmith) {
        services.system.logger.warn?.(
            "[quest:dorics-quest] No generic smith handler found; anvil gate not installed",
        );
        return;
    }
    registry.registerLocScript({
        locId: DORIC_ANVIL_LOC_ID,
        action: "smith",
        handler: (event) => {
            const { tile, level } = event;
            const inDoricHouse =
                level === DORIC_ANVIL_AREA.level &&
                tile.x >= DORIC_ANVIL_AREA.minX &&
                tile.x <= DORIC_ANVIL_AREA.maxX &&
                tile.y >= DORIC_ANVIL_AREA.minY &&
                tile.y <= DORIC_ANVIL_AREA.maxY;
            if (inDoricHouse && !isQuestComplete(event.player, doricsQuest)) {
                services.messaging.sendGameMessage(
                    event.player,
                    "You need to complete Doric's Quest before you can use Doric's anvils.",
                );
                return;
            }
            return genericSmith(event);
        },
    });
}

// ============================================================================
// Definition
// ============================================================================

export const DORICS_QUEST_KEY = "dorics_quest";

export const doricsQuest: QuestDefinition = {
    key: DORICS_QUEST_KEY,
    name: "Doric's Quest",
    varpId: VARP_DORICS_QUEST,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Mining, amount: 1300, label: "Mining" }],
        items: [{ itemId: COINS_ITEM_ID, quantity: 180, label: "180 Coins" }],
        other: ["Use of Doric's anvils"],
    },
    rewardItemId: STEEL_PICKAXE_ITEM_ID,
    overviewStartText:
        "talking to <col=800000>Doric<col=000080> at his home north of <col=800000>Falador<col=000080>.",

    buildJournal(player: PlayerState, services: ScriptServices): string[] {
        const stage = getQuestStage(player, doricsQuest);
        if (stage >= STAGE_COMPLETE) {
            return [
                "<str>I have spoken to Doric.</str>",
                "<str>I have collected some clay, copper and</str>",
                "<str>iron ore, and Doric let me use his anvils.</str>",
                "",
                "<col=ff0000>QUEST COMPLETE!</col>",
            ];
        }
        if (stage >= STAGE_STARTED) {
            const lines = [
                "I have spoken to <col=800000>Doric</col>.",
                "",
                "To use his anvils, I need to bring him:",
            ];
            for (const req of REQUIRED_ITEMS) {
                const carried = countCarriedItem(player, services, req.itemId);
                lines.push(
                    carried >= req.quantity ? `<str>${req.journalLabel}</str>` : req.journalLabel,
                );
            }
            return lines;
        }
        return [
            "I can start this quest by speaking to",
            "<col=800000>Doric</col> who is <col=800000>north of Falador</col>.",
            "",
            "There aren't any requirements for this quest,",
            "but level <col=800000>15 Mining</col> will help.",
        ];
    },

    register(registry: IScriptRegistry, services: ScriptServices): void {
        registry.registerNpcScript({
            npcId: DORIC_NPC_ID,
            option: "talk-to",
            handler: handleDoricTalk,
        });
        registry.registerNpcScript({
            npcId: DORIC_NPC_ID,
            option: undefined,
            handler: handleDoricTalk,
        });
        registerDoricAnvilGate(registry, services);
    },
};
