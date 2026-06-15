import { SkillId } from "../../../../../../src/rs/skill/skills";
import type { IScriptRegistry, ScriptServices } from "../../../../../src/game/scripts/types";
import type { QuestDefinition } from "../../types";
import {
    BALL_OF_WOOL_ITEM_ID,
    COINS_ITEM_ID,
    REWARD_SCROLL_ITEM_ID,
    SHEEP_SHEARER_KEY,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_SHEEP_SHEARER,
} from "./constants";
import { registerSheepShearerInteractions } from "./interactions";
import { buildSheepShearerJournal } from "./journal";

export { SHEEP_SHEARER_KEY } from "./constants";

export const sheepShearerQuest: QuestDefinition = {
    key: SHEEP_SHEARER_KEY,
    name: "Sheep Shearer",
    varpId: VARP_SHEEP_SHEARER,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Crafting, amount: 150, label: "Crafting" }],
        items: [{ itemId: COINS_ITEM_ID, quantity: 60, label: "60 Coins" }],
    },
    rewardItemId: REWARD_SCROLL_ITEM_ID,
    overviewStartText:
        "talking to <col=800000>Fred the Farmer<col=000080> at his farm north-west of <col=800000>Lumbridge<col=000080>.",
    buildJournal: buildSheepShearerJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerSheepShearerInteractions(sheepShearerQuest, registry, services);
    },
};

export { BALL_OF_WOOL_ITEM_ID };
