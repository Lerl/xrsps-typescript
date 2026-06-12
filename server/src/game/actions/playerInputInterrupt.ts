import type { PlayerState } from "../player";
import type { ActionScheduler } from "./ActionScheduler";

/**
 * Engine-level input interruption.
 *
 * Player input (walk click, new interaction, manual teleport request) clears
 * the weak class of pending behavior:
 * - weak queue tasks (e.g. the Home Teleport sequence)
 * - interruptible scheduled actions per the interruption registry
 *   (skilling loops, item-on-item production)
 *
 * Standard/strong queue tasks (queued damage, level-ups, death), timers and
 * non-interruptible actions deliberately survive input.
 *
 * Every input path must route through this function instead of cancelling
 * feature-specific action groups.
 *
 * @returns the number of scheduled actions that were cancelled
 */
export function interruptForPlayerInput(
    player: PlayerState,
    actionScheduler: ActionScheduler,
): number {
    player.interruptWeakQueues();
    return actionScheduler.cancelInterruptibleActions(player.id);
}
