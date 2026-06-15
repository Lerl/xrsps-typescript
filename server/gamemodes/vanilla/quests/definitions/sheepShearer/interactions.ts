import type { IScriptRegistry, ScriptServices } from "../../../../../src/game/scripts/types";
import type { QuestDefinition } from "../../types";
import { FRED_THE_FARMER_NPC_ID } from "./constants";
import { createSheepShearerTalkHandler } from "./dialogue";

export function registerSheepShearerInteractions(
    quest: QuestDefinition,
    registry: IScriptRegistry,
    _services: ScriptServices,
): void {
    const handleFredTalk = createSheepShearerTalkHandler(quest);
    registry.registerNpcScript({
        npcId: FRED_THE_FARMER_NPC_ID,
        option: "talk-to",
        handler: handleFredTalk,
    });
    registry.registerNpcScript({
        npcId: FRED_THE_FARMER_NPC_ID,
        option: undefined,
        handler: handleFredTalk,
    });
}
