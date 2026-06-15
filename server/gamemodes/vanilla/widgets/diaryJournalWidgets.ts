import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";

// ============================================================================
// Constants
// ============================================================================

/** Achievement diary list interface (side journal diary tab content) */
const DIARY_LIST_GROUP_ID = 259;
/**
 * Container whose dynamic rows carry the per-area ops.
 * [clientscript,build_achievement_list] (709) creates 12 clickable rows as
 * children 0-11 of 259:2 where the child index IS the area index, with
 * op1 "Open <Area> Journal" and op2 "Wiki <Area> Journal".
 */
const DIARY_LIST_TASKBOX_COMPONENT = 2;

/** Achievement diary journal scroll interface */
const DIARY_SCROLL_GROUP_ID = 741;
/** Title component: achievementdiary_scroll title text */
const DS_TITLE_CHILD = 2;
/** First journal line component */
const DS_FIRST_LINE_CHILD = 4;
/** Number of line components cleared before writing (covers stale re-opens) */
const DS_LINE_CLEAR_COUNT = 24;

/** OP ID for "Open <Area> Journal" */
const OP_OPEN_JOURNAL = 1;
/** OP ID for "Wiki <Area> Journal" (handled client-side in OSRS; ignored here) */
const OP_WIKI_JOURNAL = 2;

const TIER_NAMES = ["Easy", "Medium", "Hard", "Elite"] as const;

// ============================================================================
// Diary area data
// ============================================================================

interface DiaryTier {
    /** Varbit holding the player's completed-task count for the tier */
    countVarbit: number;
    /** Total tasks in the tier ([proc,diary_completion_info] (2200)) */
    total: number;
    /** Varbit holding the tier completion flag */
    completeVarbit: number;
    /** Value of completeVarbit that marks the tier complete (Karamja uses 2) */
    completeValue: number;
}

interface DiaryArea {
    /** Display name (enum 595, indexed by area id) */
    name: string;
    /** Easy / Medium / Hard / Elite */
    tiers: [DiaryTier, DiaryTier, DiaryTier, DiaryTier];
}

function tier(
    countVarbit: number,
    total: number,
    completeVarbit: number,
    completeValue = 1,
): DiaryTier {
    return { countVarbit, total, completeVarbit, completeValue };
}

/**
 * Diary areas indexed by area id (= dynamic child index in the diary list).
 * Names from enum 595; totals from [proc,diary_completion_info] (2200);
 * varbits match the ones the diary list CS2 reads (see data/loginVarbits.ts).
 */
const DIARY_AREAS: ReadonlyArray<DiaryArea> = [
    {
        name: "Karamja",
        tiers: [
            tier(2423, 10, 3578, 2),
            tier(6288, 19, 3599, 2),
            tier(6289, 10, 3611, 2),
            tier(6290, 5, 4566),
        ],
    },
    {
        name: "Ardougne",
        tiers: [
            tier(6291, 10, 4458),
            tier(6292, 12, 4459),
            tier(6293, 12, 4460),
            tier(6294, 8, 4461),
        ],
    },
    {
        name: "Falador",
        tiers: [
            tier(6299, 11, 4462),
            tier(6300, 14, 4463),
            tier(6301, 11, 4464),
            tier(6302, 6, 4465),
        ],
    },
    {
        name: "Fremennik",
        tiers: [
            tier(6303, 10, 4491),
            tier(6304, 9, 4492),
            tier(6305, 9, 4493),
            tier(6306, 6, 4494),
        ],
    },
    {
        name: "Kandarin",
        tiers: [
            tier(6307, 11, 4475),
            tier(6308, 14, 4476),
            tier(6309, 11, 4477),
            tier(6310, 7, 4478),
        ],
    },
    {
        name: "Desert",
        tiers: [
            tier(6295, 11, 4483),
            tier(6296, 12, 4484),
            tier(6297, 10, 4485),
            tier(6298, 6, 4486),
        ],
    },
    {
        name: "Lumbridge & Draynor",
        tiers: [
            tier(6311, 12, 4495),
            tier(6312, 12, 4496),
            tier(6313, 11, 4497),
            tier(6314, 6, 4498),
        ],
    },
    {
        name: "Morytania",
        tiers: [
            tier(6315, 11, 4487),
            tier(6316, 11, 4488),
            tier(6317, 10, 4489),
            tier(6318, 6, 4490),
        ],
    },
    {
        name: "Varrock",
        tiers: [
            tier(6319, 14, 4479),
            tier(6320, 13, 4480),
            tier(6321, 10, 4481),
            tier(6322, 5, 4482),
        ],
    },
    {
        name: "Wilderness",
        tiers: [
            tier(6323, 12, 4466),
            tier(6324, 11, 4467),
            tier(6325, 10, 4468),
            tier(6326, 7, 4469),
        ],
    },
    {
        name: "Western Provinces",
        tiers: [
            tier(6327, 11, 4471),
            tier(6328, 13, 4472),
            tier(6329, 13, 4473),
            tier(6330, 7, 4474),
        ],
    },
    {
        name: "Kourend & Kebos",
        tiers: [
            tier(7933, 12, 7925),
            tier(7934, 13, 7926),
            tier(7935, 10, 7927),
            tier(7936, 8, 7928),
        ],
    },
];

// ============================================================================
// Journal text generation
// ============================================================================

const COLOR_COMPLETE = "0dc10d";
const COLOR_IN_PROGRESS = "ffff00";
const COLOR_NOT_STARTED = "ff0000";

function buildDiaryJournalLines(player: PlayerState, area: DiaryArea): string[] {
    const lines: string[] = [];
    for (let i = 0; i < area.tiers.length; i++) {
        const t = area.tiers[i];
        const count = Math.min(player.varps.getVarbitValue(t.countVarbit), t.total);
        const complete = player.varps.getVarbitValue(t.completeVarbit) >= t.completeValue;
        const colour = complete
            ? COLOR_COMPLETE
            : count > 0
              ? COLOR_IN_PROGRESS
              : COLOR_NOT_STARTED;
        const shown = complete ? t.total : count;
        lines.push(`<col=${colour}>${TIER_NAMES[i]} tasks: ${shown}/${t.total}</col>`);
        lines.push(
            complete
                ? `<str>You have completed all of the ${TIER_NAMES[i].toLowerCase()} tasks.`
                : `You have completed ${shown} of the ${t.total} ${TIER_NAMES[i].toLowerCase()} tasks.`,
        );
        lines.push("");
    }
    return lines;
}

// ============================================================================
// Journal opening
// ============================================================================

/**
 * Open the achievement diary journal scroll (741) for an area.
 *
 * The scroll is a plain server-text interface: title at 741:2, line texts from
 * 741:4. Its close button (741:205) is self-contained CS2 (script 29, if_close),
 * so no server-side close handler is needed beyond standard modal tracking.
 */
function openDiaryJournal(player: PlayerState, areaId: number, services: ScriptServices): void {
    const area = DIARY_AREAS[areaId];
    if (!area) return;

    const playerId = player.id;
    const displayMode = player.displayMode ?? 1;
    const mainmodalUid = services.viewport.getMainmodalUid(displayMode);

    services.dialog.openSubInterface(player, mainmodalUid, DIARY_SCROLL_GROUP_ID, 0);

    const lines = buildDiaryJournalLines(player, area);

    services.dialog.queueWidgetEvent(playerId, {
        action: "set_text",
        uid: (DIARY_SCROLL_GROUP_ID << 16) | DS_TITLE_CHILD,
        text: `${area.name} Area Tasks`,
    });

    for (let i = 0; i < DS_LINE_CLEAR_COUNT; i++) {
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: (DIARY_SCROLL_GROUP_ID << 16) | (DS_FIRST_LINE_CHILD + i),
            text: i < lines.length ? lines[i] : "",
        });
    }

    services.system.logger.info?.(
        `[diary-journal] Opened journal for player=${playerId} area="${area.name}" (id=${areaId})`,
    );
}

// ============================================================================
// Module
// ============================================================================

export function registerDiaryJournalWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    // Handle diary list clicks (259:2). Dynamic child index = area id.
    registry.onButton(DIARY_LIST_GROUP_ID, DIARY_LIST_TASKBOX_COMPONENT, (event) => {
        const { player, slot, opId } = event;
        const areaId = slot ?? -1;
        if (areaId < 0 || areaId >= DIARY_AREAS.length) return;

        if (opId === OP_OPEN_JOURNAL) {
            openDiaryJournal(player, areaId, services);
            return;
        }
        if (opId === OP_WIKI_JOURNAL) {
            // Wiki lookups open the browser client-side in OSRS; nothing to do here.
            return;
        }
    });
}
