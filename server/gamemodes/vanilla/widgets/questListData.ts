import { ScriptVarTypeId } from "../../../../src/rs/config/db/ScriptVarType";
import type { ScriptServices } from "../../../src/game/scripts/types";

export interface QuestEntry {
    questId: number;
    dbrowId: number;
    displayName: string;
}

export interface QuestCompletionInfo {
    varpId: number;
    completionValue: number;
    varbitEntries?: Array<{ varbitId: number; value: number }>;
}

const QUEST_DB_TABLE_ID = 0;

export function buildQuestMap(services: ScriptServices): Map<number, QuestEntry> {
    const map = new Map<number, QuestEntry>();
    const dbRepo = services.data.getDbRepository();
    if (!dbRepo) return map;

    const rows = dbRepo.getRows(QUEST_DB_TABLE_ID);
    if (rows.length === 0) return map;

    const tableDef = dbRepo.getTables().get(QUEST_DB_TABLE_ID);
    if (!tableDef) return map;

    let idColumnId = -1;
    let nameColumnId = -1;

    for (const [colId, colDef] of tableDef.columns) {
        if (colDef.types.length !== 1) continue;
        if (colDef.types[0] === ScriptVarTypeId.INTEGER && idColumnId === -1) {
            idColumnId = colId;
        }
        if (colDef.types[0] === ScriptVarTypeId.STRING && nameColumnId === -1) {
            nameColumnId = colId;
        }
    }

    if (idColumnId === -1 || nameColumnId === -1) {
        services.system.logger.warn?.(
            `[quest-journal] Could not discover quest DB columns: id=${idColumnId} name=${nameColumnId}`,
        );
        return map;
    }

    for (const row of rows) {
        const idCol = row.getColumn(idColumnId);
        const nameCol = row.getColumn(nameColumnId);

        const questId = idCol?.values?.[0];
        const displayName = nameCol?.values?.[0];

        if (typeof questId === "number" && questId > 0 && typeof displayName === "string") {
            map.set(questId, {
                questId,
                dbrowId: row.id,
                displayName,
            });
        }
    }

    services.system.logger.info?.(
        `[quest-journal] Loaded ${map.size} quests from cache DB table ${QUEST_DB_TABLE_ID}`,
    );
    return map;
}

const QUEST_COMPLETION_DATA = new Map<string, QuestCompletionInfo>([
    ["desert treasure", { varpId: 440, completionValue: 15 }],
    ["lunar diplomacy", { varpId: 823, completionValue: 190 }],
    ["legend's quest", { varpId: 139, completionValue: 180 }],
    ["underground pass", { varpId: 161, completionValue: 110 }],
    ["mage arena", { varpId: 267, completionValue: 8 }],
    [
        "mage arena ii",
        { varpId: -1, completionValue: 0, varbitEntries: [{ varbitId: 6067, value: 6 }] },
    ],
    ["eadgar's ruse", { varpId: 335, completionValue: 110 }],
    ["watchtower", { varpId: 212, completionValue: 13 }],
    ["plague city", { varpId: 165, completionValue: 29 }],
    ["biohazard", { varpId: 68, completionValue: 16 }],
    [
        "client of kourend",
        { varpId: -1, completionValue: 0, varbitEntries: [{ varbitId: 5619, value: 9 }] },
    ],
    [
        "dream mentor",
        { varpId: -1, completionValue: 0, varbitEntries: [{ varbitId: 3618, value: 28 }] },
    ],
    ["cook's assistant", { varpId: 29, completionValue: 2 }],
    ["demon slayer", { varpId: 2561, completionValue: 3 }],
    ["doric's quest", { varpId: 31, completionValue: 100 }],
    ["dragon slayer i", { varpId: 176, completionValue: 10 }],
    ["ernest the chicken", { varpId: 32, completionValue: 3 }],
    ["goblin diplomacy", { varpId: 2378, completionValue: 6 }],
    ["imp catcher", { varpId: 160, completionValue: 2 }],
    ["the knight's sword", { varpId: 122, completionValue: 7 }],
    ["pirate's treasure", { varpId: 71, completionValue: 4 }],
    ["prince ali rescue", { varpId: 273, completionValue: 110 }],
    ["the restless ghost", { varpId: 107, completionValue: 5 }],
    ["romeo & juliet", { varpId: 144, completionValue: 100 }],
    ["rune mysteries", { varpId: 63, completionValue: 6 }],
    ["sheep shearer", { varpId: 179, completionValue: 21 }],
    ["shield of arrav", { varpId: 145, completionValue: 7 }],
    ["vampyre slayer", { varpId: 178, completionValue: 3 }],
    ["witch's potion", { varpId: 67, completionValue: 3 }],
    ["black knights' fortress", { varpId: 130, completionValue: 4 }],
    [
        "pandemonium",
        { varpId: -1, completionValue: 0, varbitEntries: [{ varbitId: 18314, value: 6 }] },
    ],
]);

export function getQuestCompletionInfo(displayName: string): QuestCompletionInfo | undefined {
    return QUEST_COMPLETION_DATA.get(displayName.toLowerCase());
}
