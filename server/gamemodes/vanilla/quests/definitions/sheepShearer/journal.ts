import type { PlayerState } from "../../../../../src/game/player";
import type { ScriptServices } from "../../../../../src/game/scripts/types";
import { countCarriedItem } from "../../QuestService";
import { REQUIRED_ITEMS, STAGE_COMPLETE, STAGE_STARTED, VARP_SHEEP_SHEARER } from "./constants";

export function buildSheepShearerJournal(player: PlayerState, services: ScriptServices): string[] {
    const stage = player.varps.getVarpValue(VARP_SHEEP_SHEARER);
    if (stage >= STAGE_COMPLETE) {
        return [
            "<str>I have spoken to Fred the Farmer.</str>",
            "<str>I have collected twenty balls of wool and</str>",
            "<str>given them to him.</str>",
            "",
            "<col=ff0000>QUEST COMPLETE!</col>",
        ];
    }
    if (stage >= STAGE_STARTED) {
        const lines = [
            "I have spoken to <col=800000>Fred the Farmer</col>.",
            "",
            "He wants me to bring him:",
        ];
        for (const req of REQUIRED_ITEMS) {
            const carried = countCarriedItem(player, services, req.itemId);
            lines.push(
                carried >= req.quantity ? `<str>${req.journalLabel}</str>` : req.journalLabel,
            );
        }
        lines.push("", "I can shear sheep and spin the wool on a", "spinning wheel.");
        return lines;
    }
    return [
        "I can start this quest by speaking to",
        "<col=800000>Fred the Farmer</col> who lives",
        "<col=800000>north-west of Lumbridge</col>.",
        "",
        "There aren't any requirements for this quest.",
    ];
}
