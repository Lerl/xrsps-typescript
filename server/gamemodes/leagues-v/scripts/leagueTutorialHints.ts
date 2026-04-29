import { getPopoutUid } from "../../../src/widgets/viewport";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices, WidgetActionEvent } from "../../../src/game/scripts/types";

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

const SCRIPT_HIGHLIGHT_SCREEN_COMPONENT = 2463;
const SCRIPT_HIGHLIGHT_TEXTBOX_DEFAULT = 2465;
const VARBIT_HINT_STEP = 10308;
const VARBIT_HINT_MAX_STEP = 10309;

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

const uid = (groupId: number, childId: number): number => (groupId << 16) | childId;

type LeagueTutorialHintSequence = "tasks" | "areas" | "relics";

type LeagueTutorialHintState = {
    sequence: LeagueTutorialHintSequence;
    index: number;
};

type HintStep = {
    text: string;
    targetUid: number;
    targetChildIndex?: number;
};

type HintWidgetAction =
    | {
          action: "run_script";
          scriptId: number;
          args: (number | string)[];
          varbits: Record<number, number>;
      }
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
        },
        {
            text: "The detail panel explains the selected area and shows the Unlock button.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 41),
        },
        {
            text: "Confirming an area unlock makes it permanent for this League profile.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 61),
        },
        {
            text: "After Karamja is unlocked, close Areas to move on to relic selection.",
            targetUid: uid(LEAGUE_AREAS_GROUP_ID, 5),
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
        },
        {
            text: "The expanded view shows the relic effect and the reward item it grants.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 27),
        },
        {
            text: "Confirming a relic selection makes that tier choice permanent.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 51),
        },
        {
            text: "Close Relics after choosing your first relic to finish the tutorial flow.",
            targetUid: uid(LEAGUE_RELICS_GROUP_ID, 4),
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

function renderHint(player: PlayerState, bridge: HintBridge, state: LeagueTutorialHintState): void {
    const steps = HINTS[state.sequence];
    const index = Math.max(0, Math.min(state.index, steps.length - 1));
    const step = steps[index];
    const hostUid = getPopoutUid(player.displayMode);
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
        action: "run_script",
        scriptId: SCRIPT_HIGHLIGHT_TEXTBOX_DEFAULT,
        args: [
            HINT_TEXT_COLOUR,
            1,
            0,
            SCREENHIGHLIGHT_ROOT_UID,
            HINT_POSITION_BOTTOM,
            step.text,
        ],
        varbits: {
            [VARBIT_HINT_STEP]: index,
            [VARBIT_HINT_MAX_STEP]: steps.length,
        },
    });
}

export function startLeagueTutorialHints(
    player: PlayerState,
    services: ScriptServices,
    sequence: LeagueTutorialHintSequence,
): void {
    const state: LeagueTutorialHintState = { sequence, index: 0 };
    setState(player, state);

    services.dialog.openSubInterface(
        player,
        getPopoutUid(player.displayMode),
        SCREENHIGHLIGHT_GROUP_ID,
        1,
        {
            hiddenUids: [
                SCREENHIGHLIGHT_BLACK_BORDER_UID,
                SCREENHIGHLIGHT_BACKGROUND_UID,
                SCREENHIGHLIGHT_INFORMATION_BOX_UID,
            ],
        },
    );
    renderHint(player, services.dialog, state);
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
    if (widgetId === SCREENHIGHLIGHT_PREVIOUS_UID) {
        state.index = Math.max(0, state.index - 1);
        setState(player, state);
        renderHint(player, bridge, state);
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
