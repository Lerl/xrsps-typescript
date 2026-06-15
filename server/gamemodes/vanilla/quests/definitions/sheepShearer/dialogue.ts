import type { PlayerState } from "../../../../../src/game/player";
import type { NpcInteractionEvent, ScriptServices } from "../../../../../src/game/scripts/types";
import {
    completeQuest,
    getQuestStage,
    hasQuestItems,
    setQuestStage,
    takeQuestItems,
} from "../../QuestService";
import { type DialogueContext, type DialogueStep, startConversation } from "../../dialogue";
import type { QuestDefinition } from "../../types";
import { FRED_THE_FARMER_NPC_ID, REQUIRED_ITEMS, STAGE_COMPLETE, STAGE_STARTED } from "./constants";

function buildAcceptSteps(quest: QuestDefinition): DialogueStep[] {
    return [
        {
            npc: [
                "I need twenty balls of wool. You can shear my",
                "sheep with some shears, then spin the wool on a",
                "spinning wheel.",
            ],
        },
        {
            npc: [
                "There are some shears in the house if you need",
                "them. Bring me the balls of wool and I'll pay you.",
            ],
        },
        {
            exec: (ctx) => {
                setQuestStage(ctx.player, quest, ctx.services, STAGE_STARTED);
            },
        },
        { player: ["I'll get them for you."] },
    ];
}

function buildQuestOfferSteps(quest: QuestDefinition): DialogueStep[] {
    return [
        {
            npc: ["You're after a quest, eh? Actually, I could do", "with a bit of help."],
        },
        {
            npc: [
                "My sheep are getting mighty woolly. If you could",
                "shear them and spin the wool into balls, I would",
                "be grateful.",
            ],
        },
        {
            options: [
                { text: "Yes okay. I can do that.", next: buildAcceptSteps(quest) },
                {
                    text: "That doesn't sound very adventurous.",
                    next: [
                        {
                            npc: [
                                "It is not the most dangerous work, but it needs",
                                "doing all the same.",
                            ],
                        },
                    ],
                },
            ],
        },
    ];
}

function buildNotStartedSteps(quest: QuestDefinition): DialogueStep[] {
    return [
        {
            npc: [
                "What are you doing on my land? You're not the",
                "one who keeps leaving all my gates open, are you?",
            ],
        },
        {
            options: [
                { text: "I'm looking for a quest.", next: buildQuestOfferSteps(quest) },
                {
                    text: "I'm looking for something to kill.",
                    next: [{ npc: ["What, on my land? Leave my livestock alone."] }],
                },
                {
                    text: "I'm lost.",
                    next: [
                        {
                            npc: [
                                "The road south-east leads back towards",
                                "Lumbridge. Try not to trample the fields.",
                            ],
                        },
                    ],
                },
            ],
        },
    ];
}

function buildReminderSteps(): DialogueStep[] {
    return [
        { npc: ["How are you doing getting those balls of wool?"] },
        { player: ["I haven't got them all yet."] },
        {
            npc: [
                "I need twenty balls of wool. Shear the sheep,",
                "then spin the wool on a spinning wheel.",
            ],
        },
    ];
}

function buildCompletionSteps(quest: QuestDefinition): DialogueStep[] {
    return [
        { npc: ["How are you doing getting those balls of wool?"] },
        { player: ["I have the twenty balls of wool."] },
        {
            npc: [
                "I guess I had better pay you then. Thank you,",
                "this will keep me going for a while.",
            ],
        },
        {
            exec: (ctx) => {
                if (!takeQuestItems(ctx.player, ctx.services, REQUIRED_ITEMS)) {
                    ctx.services.messaging.sendGameMessage(
                        ctx.player,
                        "You don't have all the balls of wool Fred needs.",
                    );
                    return;
                }
                completeQuest(ctx.player, ctx.services, quest);
            },
        },
    ];
}

function buildInProgressSteps(
    quest: QuestDefinition,
    player: PlayerState,
    services: ScriptServices,
): DialogueStep[] {
    if (hasQuestItems(player, services, REQUIRED_ITEMS)) {
        return buildCompletionSteps(quest);
    }
    return buildReminderSteps();
}

const completedSteps: DialogueStep[] = [
    { npc: ["Hello again. Thanks for helping with the sheep."] },
    { player: ["You're welcome."] },
];

export function createSheepShearerTalkHandler(
    quest: QuestDefinition,
): (event: NpcInteractionEvent) => void {
    return (event) => {
        const { player, services } = event;
        const ctx: DialogueContext = {
            player,
            services,
            npcId: FRED_THE_FARMER_NPC_ID,
            npcName: "Fred the Farmer",
        };

        const stage = getQuestStage(player, quest);
        if (stage >= STAGE_COMPLETE) {
            startConversation(ctx, completedSteps);
        } else if (stage >= STAGE_STARTED) {
            startConversation(ctx, buildInProgressSteps(quest, player, services));
        } else {
            startConversation(ctx, buildNotStartedSteps(quest));
        }
    };
}
