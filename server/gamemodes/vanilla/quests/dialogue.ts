import type { PlayerState } from "../../../src/game/player";
import type { ScriptServices } from "../../../src/game/scripts/types";

// ============================================================================
// Declarative dialogue runner
//
// Plays a linear sequence of chatbox dialogue steps (NPC chat, player chat,
// option menus, server actions) without hand-rolled callback nesting. Option
// branches splice their steps in front of the remaining sequence, so all
// branches converge on whatever follows the options step.
// ============================================================================

export interface DialogueContext {
    player: PlayerState;
    services: ScriptServices;
    npcId: number;
    npcName: string;
}

export interface DialogueOption {
    text: string;
    /** Echo the chosen text as a player chat line before continuing (default true) */
    echo?: boolean;
    next?: DialogueStep[];
}

export type DialogueStep =
    | { npc: string[]; animationId?: number }
    | { player: string[]; animationId?: number }
    | { options: DialogueOption[]; title?: string }
    | { exec: (ctx: DialogueContext) => void };

const activeConversations = new Set<number>();
let dialogSequence = 0;

export function startConversation(ctx: DialogueContext, steps: DialogueStep[]): void {
    const pid = ctx.player.id;
    if (activeConversations.has(pid)) {
        // Self-heal a stale guard if another system closed our dialog without
        // firing onClose (e.g. a different script replaced the chatbox modal).
        const modalOpen =
            ctx.services.dialog.getInterfaceService()?.getCurrentChatboxModal(ctx.player) !==
            undefined;
        if (modalOpen) return;
        activeConversations.delete(pid);
    }
    activeConversations.add(pid);
    playSteps(ctx, steps);
}

function endConversation(ctx: DialogueContext, closeDialogId?: string): void {
    if (closeDialogId !== undefined) {
        ctx.services.dialog.closeDialog(ctx.player, closeDialogId);
    }
    activeConversations.delete(ctx.player.id);
}

function playSteps(ctx: DialogueContext, steps: DialogueStep[]): void {
    const step = steps[0];
    if (!step) {
        endConversation(ctx);
        return;
    }
    const rest = steps.slice(1);

    if ("exec" in step) {
        step.exec(ctx);
        if (rest.length === 0) {
            endConversation(ctx);
        } else {
            playSteps(ctx, rest);
        }
        return;
    }

    const dialogId = `quest_dialogue_${ctx.player.id}_${dialogSequence++}`;
    const onClose = () => endConversation(ctx);

    if ("options" in step) {
        ctx.services.dialog.openDialogOptions(ctx.player, {
            id: dialogId,
            title: step.title ?? "Select an Option",
            options: step.options.map((option) => option.text),
            onClose,
            onSelect: (choice) => {
                const selected = step.options[choice];
                if (!selected) {
                    endConversation(ctx);
                    return;
                }
                const echoed: DialogueStep[] =
                    selected.echo === false ? [] : [{ player: [selected.text] }];
                playSteps(ctx, [...echoed, ...(selected.next ?? []), ...rest]);
            },
        });
        return;
    }

    const isLast = rest.length === 0;
    const onContinue = isLast ? () => endConversation(ctx, dialogId) : () => playSteps(ctx, rest);

    if ("npc" in step) {
        ctx.services.dialog.openDialog(ctx.player, {
            kind: "npc",
            id: dialogId,
            npcId: ctx.npcId,
            npcName: ctx.npcName,
            lines: step.npc,
            animationId: step.animationId,
            clickToContinue: true,
            closeOnContinue: isLast,
            onContinue,
            onClose,
        });
        return;
    }

    ctx.services.dialog.openDialog(ctx.player, {
        kind: "player",
        id: dialogId,
        playerName: ctx.player.name ?? "You",
        lines: step.player,
        animationId: step.animationId,
        clickToContinue: true,
        closeOnContinue: isLast,
        onContinue,
        onClose,
    });
}
