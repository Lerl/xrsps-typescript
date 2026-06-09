import type { PlayerState } from "../../../src/game/player";
import type {
    IScriptRegistry,
    ScriptServices,
    WidgetActionEvent,
} from "../../../src/game/scripts/types";
import { getPopoutUid } from "../../../src/widgets/viewport";

const SCREENHIGHLIGHT_GROUP_ID = 664;
const SCREENHIGHLIGHT_ROOT_UID = (SCREENHIGHLIGHT_GROUP_ID << 16) | 0;
const SCREENHIGHLIGHT_BLACK_BORDER_UID = (SCREENHIGHLIGHT_GROUP_ID << 16) | 2;
const SCREENHIGHLIGHT_BACKGROUND_UID = (SCREENHIGHLIGHT_GROUP_ID << 16) | 7;
const SCREENHIGHLIGHT_INFORMATION_BOX_UID = (SCREENHIGHLIGHT_GROUP_ID << 16) | 8;
const SCREENHIGHLIGHT_PAUSE_UID = (SCREENHIGHLIGHT_GROUP_ID << 16) | 9;
const SCREENHIGHLIGHT_CONTINUE_UID = (SCREENHIGHLIGHT_GROUP_ID << 16) | 31;
const SCREENHIGHLIGHT_PREVIOUS_UID = (SCREENHIGHLIGHT_GROUP_ID << 16) | 32;
const SCREENHIGHLIGHT_CONTINUE_CHILD = 31;
const SCREENHIGHLIGHT_PREVIOUS_CHILD = 32;
const SCREENHIGHLIGHT_BUTTON_LABEL_SLOT = 9;

const SCRIPT_HIGHLIGHT_SCREEN_COMPONENT = 2463;
const SCRIPT_HIGHLIGHT_TEXTBOX_DEFAULT = 2465;
const SCRIPT_LEAGUE_AREA_BACK = 3678;
const SCRIPT_LEAGUE_AREA_CONFIRM_BACK = 3680;
const SCRIPT_LEAGUE_RELIC_BACK = 3196;
const VARBIT_HINT_STEP = 10308;
const VARBIT_HINT_MAX_STEP = 10309;
const IF_SETEVENTS_TRANSMIT_OP1 = 1 << 1;

const HINT_TEXT_COLOUR = 0xffffff;
const HINT_POSITION_BOTTOM = 4;
const HIGHLIGHT_POSITION_LEFT = 0;
const HIGHLIGHT_POSITION_TOP = 0;
const HIGHLIGHT_DIM_TRANSPARENCY = 120;
const HIGHLIGHT_SHOW_BACKGROUND = 0;

const LEAGUE_TASKS_GROUP_ID = 657;
const LEAGUE_AREAS_GROUP_ID = 512;
const LEAGUE_RELICS_GROUP_ID = 655;
const LEAGUE_TASKS_RELIC_UNLOCK_PROGRESS_CHILD = 7;
const LEAGUE_AREAS_CONFIRM_LAYER_CHILD = 12;
const LEAGUE_AREAS_MAP_BG_LAYER_CHILD = 14;
const LEAGUE_AREAS_SHIELDS_LAYER_CHILD = 38;
const LEAGUE_AREAS_NAMES_LAYER_CHILD = 39;
const LEAGUE_AREAS_DETAILS_CHILD = 41;
const LEAGUE_AREAS_ICON_CHILD = 89;
const LEAGUE_RELICS_CONFIRM_LAYER_CHILD = 12;
const LEAGUE_RELICS_VIEW_ALL_CHILD = 14;
const LEAGUE_RELICS_VIEW_ALL_SCROLLBAR_CHILD = 23;
const LEAGUE_RELICS_VIEW_ONE_CHILD = 27;
const LEAGUE_RELICS_LOADING_CHILD = 24;
const LEAGUE_RELICS_CLOSE_CHILD = 4;

const uid = (groupId: number, childId: number): number => (groupId << 16) | childId;

export type LeagueTutorialHintSequence = "tasks" | "areas" | "relics";
type LeagueTutorialHintAdvance =
    | "areas_select_karamja"
    | "areas_unlock_karamja"
    | "areas_confirm_karamja"
    | "areas_close"
    | "relics_view_relic"
    | "relics_select_relic"
    | "relics_confirm_relic";

type LeagueTutorialHintState = {
    sequence: LeagueTutorialHintSequence;
    index: number;
};

type HintStep = {
    text: string;
    targetUid: number;
    targetChildIndex?: number;
    advanceOn?: LeagueTutorialHintAdvance;
    previousEnabled?: boolean;
};

type HintWidgetAction =
    | {
          action: "run_script";
          scriptId: number;
          args: (number | string)[];
          varbits: Record<number, number>;
      }
    | {
          action: "set_flags_range";
          uid: number;
          fromSlot: number;
          toSlot: number;
          flags: number;
      }
    | { action: "set_hidden"; uid: number; hidden: boolean }
    | { action: "close_sub"; targetUid: number };

type HintBridge = {
    queueWidgetEvent(playerId: number, action: HintWidgetAction): void;
};

const STATE_KEY = "leagueTutorialHint";

const HINTS: Record<LeagueTutorialHintSequence, HintStep[]> = {
    tasks: [
        {
            text: "Tasks are your main Leagues objectives. Complete and claim them to earn points.",
            targetUid: uid(LEAGUE_TASKS_GROUP_ID, 1),
        },
        {
            text: "The list can be filtered by tier, area, completion state, and task category.",
            targetUid: uid(LEAGUE_TASKS_GROUP_ID, 12),
        },
        {
            text: "When you have enough claimed points, this prompt opens your next relic unlock.",
            targetUid: uid(LEAGUE_TASKS_GROUP_ID, LEAGUE_TASKS_RELIC_UNLOCK_PROGRESS_CHILD),
        },
        {
            text: "Close this window after reviewing tasks to continue the tutorial.",
            targetUid: uid(LEAGUE_TASKS_GROUP_ID, 3),
        },
    ],
    areas: [
        {
            text: "The Areas window shows every region available in this League.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 38),
        },
        {
            text: "Select Karamja first. During the tutorial, it is the required starting unlock.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 46),
            advanceOn: "areas_select_karamja",
        },
        {
            text: "Use the Unlock button to choose Karamja as your next area.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 82),
            advanceOn: "areas_unlock_karamja",
        },
        {
            text: "Confirming an area unlock makes it permanent for this League profile.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 61),
            advanceOn: "areas_confirm_karamja",
        },
        {
            text: "After Karamja is unlocked, close Areas to move on to relic selection.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 5),
            advanceOn: "areas_close",
            previousEnabled: false,
        },
    ],
    relics: [
        {
            text: "Relics are grouped by tier. Higher tiers unlock as you earn and claim points.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 1),
        },
        {
            text: "Pick one tier-1 relic to inspect its effects before confirming.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 22),
            targetChildIndex: 0,
            advanceOn: "relics_view_relic",
        },
        {
            text: "Use the Select button after reviewing the relic effects.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 44),
            advanceOn: "relics_select_relic",
        },
        {
            text: "Confirming a relic selection makes that tier choice permanent.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 51),
            advanceOn: "relics_confirm_relic",
        },
        {
            text: "Close Relics after choosing your first relic to finish the tutorial flow.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 4),
            previousEnabled: false,
        },
    ],
};

function getState(player: PlayerState): LeagueTutorialHintState | undefined {
    const state = player.gamemodeState.get(STATE_KEY) as LeagueTutorialHintState | undefined;
    if (!state || !HINTS[state.sequence]) return undefined;
    return state;
}

function setState(player: PlayerState, state: LeagueTutorialHintState): void {
    player.gamemodeState.set(STATE_KEY, state);
}

function clearState(player: PlayerState): void {
    player.gamemodeState.delete(STATE_KEY);
}

function canGoPrevious(sequence: LeagueTutorialHintSequence, index: number): boolean {
    if (index <= 0) return false;
    return HINTS[sequence]?.[index]?.previousEnabled !== false;
}

function renderHint(player: PlayerState, bridge: HintBridge, state: LeagueTutorialHintState): void {
    const steps = HINTS[state.sequence];
    const index = Math.max(0, Math.min(state.index, steps.length - 1));
    const step = steps[index];
    const hostUid = getPopoutUid(player.displayMode);
    const previousFlags = canGoPrevious(state.sequence, index) ? IF_SETEVENTS_TRANSMIT_OP1 : 0;
    bridge.queueWidgetEvent(player.id, {
        action: "set_hidden",
        uid: SCREENHIGHLIGHT_ROOT_UID,
        hidden: true,
    });
    bridge.queueWidgetEvent(player.id, {
        action: "run_script",
        scriptId: SCRIPT_HIGHLIGHT_SCREEN_COMPONENT,
        args: [
            SCREENHIGHLIGHT_ROOT_UID,
            hostUid,
            step.targetUid,
            step.targetChildIndex ?? -1,
            HIGHLIGHT_POSITION_LEFT,
            HIGHLIGHT_POSITION_TOP,
            HIGHLIGHT_DIM_TRANSPARENCY,
            HIGHLIGHT_SHOW_BACKGROUND,
        ],
        varbits: {
            [VARBIT_HINT_STEP]: index,
            [VARBIT_HINT_MAX_STEP]: steps.length,
        },
    });
    bridge.queueWidgetEvent(player.id, {
        action: "set_flags_range",
        uid: SCREENHIGHLIGHT_CONTINUE_UID,
        fromSlot: -1,
        toSlot: -1,
        flags: IF_SETEVENTS_TRANSMIT_OP1,
    });
    bridge.queueWidgetEvent(player.id, {
        action: "set_flags_range",
        uid: SCREENHIGHLIGHT_CONTINUE_UID,
        fromSlot: SCREENHIGHLIGHT_BUTTON_LABEL_SLOT,
        toSlot: SCREENHIGHLIGHT_BUTTON_LABEL_SLOT,
        flags: IF_SETEVENTS_TRANSMIT_OP1,
    });
    bridge.queueWidgetEvent(player.id, {
        action: "set_flags_range",
        uid: SCREENHIGHLIGHT_PREVIOUS_UID,
        fromSlot: -1,
        toSlot: -1,
        flags: previousFlags,
    });
    bridge.queueWidgetEvent(player.id, {
        action: "set_flags_range",
        uid: SCREENHIGHLIGHT_PREVIOUS_UID,
        fromSlot: SCREENHIGHLIGHT_BUTTON_LABEL_SLOT,
        toSlot: SCREENHIGHLIGHT_BUTTON_LABEL_SLOT,
        flags: previousFlags,
    });
    bridge.queueWidgetEvent(player.id, {
        action: "run_script",
        scriptId: SCRIPT_HIGHLIGHT_TEXTBOX_DEFAULT,
        args: [HINT_TEXT_COLOUR, 1, 0, SCREENHIGHLIGHT_ROOT_UID, HINT_POSITION_BOTTOM, step.text],
        varbits: {
            [VARBIT_HINT_STEP]: index,
            [VARBIT_HINT_MAX_STEP]: steps.length,
        },
    });
    bridge.queueWidgetEvent(player.id, {
        action: "set_hidden",
        uid: SCREENHIGHLIGHT_ROOT_UID,
        hidden: false,
    });
}

function rewindAreasViewForPrevious(player: PlayerState, bridge: HintBridge, index: number): void {
    if (index === 2) {
        bridge.queueWidgetEvent(player.id, {
            action: "run_script",
            scriptId: SCRIPT_LEAGUE_AREA_BACK,
            args: [
                uid(LEAGUE_AREAS_GROUP_ID, LEAGUE_AREAS_MAP_BG_LAYER_CHILD),
                uid(LEAGUE_AREAS_GROUP_ID, LEAGUE_AREAS_SHIELDS_LAYER_CHILD),
                uid(LEAGUE_AREAS_GROUP_ID, LEAGUE_AREAS_NAMES_LAYER_CHILD),
                uid(LEAGUE_AREAS_GROUP_ID, LEAGUE_AREAS_DETAILS_CHILD),
                uid(LEAGUE_AREAS_GROUP_ID, LEAGUE_AREAS_ICON_CHILD),
                0,
            ],
            varbits: {},
        });
        return;
    }

    if (index === 3) {
        bridge.queueWidgetEvent(player.id, {
            action: "run_script",
            scriptId: SCRIPT_LEAGUE_AREA_CONFIRM_BACK,
            args: [uid(LEAGUE_AREAS_GROUP_ID, LEAGUE_AREAS_CONFIRM_LAYER_CHILD)],
            varbits: {},
        });
    }
}

function rewindRelicsViewForPrevious(player: PlayerState, bridge: HintBridge, index: number): void {
    if (index === 2) {
        bridge.queueWidgetEvent(player.id, {
            action: "run_script",
            scriptId: SCRIPT_LEAGUE_RELIC_BACK,
            args: [
                uid(LEAGUE_RELICS_GROUP_ID, LEAGUE_RELICS_VIEW_ALL_CHILD),
                uid(LEAGUE_RELICS_GROUP_ID, LEAGUE_RELICS_VIEW_ALL_SCROLLBAR_CHILD),
                uid(LEAGUE_RELICS_GROUP_ID, LEAGUE_RELICS_VIEW_ONE_CHILD),
                uid(LEAGUE_RELICS_GROUP_ID, LEAGUE_RELICS_LOADING_CHILD),
                uid(LEAGUE_RELICS_GROUP_ID, LEAGUE_RELICS_CLOSE_CHILD),
            ],
            varbits: {},
        });
        return;
    }

    if (index === 3) {
        bridge.queueWidgetEvent(player.id, {
            action: "set_hidden",
            uid: uid(LEAGUE_RELICS_GROUP_ID, LEAGUE_RELICS_CONFIRM_LAYER_CHILD),
            hidden: true,
        });
    }
}

function rewindViewForPrevious(
    player: PlayerState,
    bridge: HintBridge,
    state: LeagueTutorialHintState,
): void {
    if (state.sequence === "areas") {
        rewindAreasViewForPrevious(player, bridge, state.index);
    } else if (state.sequence === "relics") {
        rewindRelicsViewForPrevious(player, bridge, state.index);
    }
}

export function startLeagueTutorialHints(
    player: PlayerState,
    services: ScriptServices,
    sequence: LeagueTutorialHintSequence,
    startIndex: number = 0,
): void {
    const steps = HINTS[sequence];
    const index = Math.max(0, Math.min(startIndex | 0, steps.length - 1));
    const state: LeagueTutorialHintState = { sequence, index };
    setState(player, state);

    services.dialog.openSubInterface(
        player,
        getPopoutUid(player.displayMode),
        SCREENHIGHLIGHT_GROUP_ID,
        1,
        {
            hiddenUids: [
                SCREENHIGHLIGHT_ROOT_UID,
                SCREENHIGHLIGHT_BLACK_BORDER_UID,
                SCREENHIGHLIGHT_BACKGROUND_UID,
                SCREENHIGHLIGHT_INFORMATION_BOX_UID,
            ],
        },
    );
    renderHint(player, services.dialog, state);
}

export function advanceLeagueTutorialHintTo(
    player: PlayerState,
    bridge: HintBridge,
    sequence: LeagueTutorialHintSequence,
    targetIndex: number,
): boolean {
    const state = getState(player);
    if (!state || state.sequence !== sequence) return false;

    const steps = HINTS[state.sequence];
    const nextIndex = Math.max(0, Math.min(targetIndex | 0, steps.length - 1));
    if (state.index >= nextIndex) return false;

    state.index = nextIndex;
    setState(player, state);
    renderHint(player, bridge, state);
    return true;
}

export function closeLeagueTutorialHints(
    player: PlayerState,
    services: Pick<ScriptServices, "dialog">,
): void {
    clearState(player);
    const targetUid = getPopoutUid(player.displayMode);
    services.dialog.closeSubInterface(player, targetUid, SCREENHIGHLIGHT_GROUP_ID);
    services.dialog.queueWidgetEvent(player.id, {
        action: "close_sub",
        targetUid,
    });
}

export function handleLeagueTutorialHintResume(
    player: PlayerState,
    bridge: HintBridge,
    widgetId: number,
): boolean {
    if (
        widgetId !== SCREENHIGHLIGHT_PAUSE_UID &&
        widgetId !== SCREENHIGHLIGHT_CONTINUE_UID &&
        widgetId !== SCREENHIGHLIGHT_PREVIOUS_UID
    ) {
        return false;
    }

    const state = getState(player);
    if (!state) return false;

    const steps = HINTS[state.sequence];
    const step = steps[state.index];
    if (widgetId === SCREENHIGHLIGHT_PREVIOUS_UID) {
        if (!canGoPrevious(state.sequence, state.index)) {
            return true;
        }
        rewindViewForPrevious(player, bridge, state);
        state.index = Math.max(0, state.index - 1);
        setState(player, state);
        renderHint(player, bridge, state);
        return true;
    }

    if (step?.advanceOn) {
        // screenhighlight itself is noClickThrough; hide it while the real widget action is pending.
        bridge.queueWidgetEvent(player.id, {
            action: "set_hidden",
            uid: SCREENHIGHLIGHT_ROOT_UID,
            hidden: true,
        });
        return true;
    }

    if (state.index >= steps.length - 1) {
        clearState(player);
        bridge.queueWidgetEvent(player.id, {
            action: "close_sub",
            targetUid: getPopoutUid(player.displayMode),
        });
        return true;
    }

    state.index += 1;
    setState(player, state);
    renderHint(player, bridge, state);
    return true;
}

export function registerLeagueTutorialHintWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    const handleHintButton = (event: WidgetActionEvent): void => {
        handleLeagueTutorialHintResume(event.player, services.dialog, event.widgetId);
    };

    registry.onButton(SCREENHIGHLIGHT_GROUP_ID, SCREENHIGHLIGHT_CONTINUE_CHILD, handleHintButton);
    registry.onButton(SCREENHIGHLIGHT_GROUP_ID, SCREENHIGHLIGHT_PREVIOUS_CHILD, handleHintButton);
}
