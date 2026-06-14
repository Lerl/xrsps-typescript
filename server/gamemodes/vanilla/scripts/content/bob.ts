import type { PlayerState } from "../../../../src/game/player";
import {
    type IScriptRegistry,
    type NpcInteractionEvent,
    type ScriptServices,
} from "../../../../src/game/scripts/types";

const LUMBRIDGE_BOB_NPC_ID = 10619;

function openBobDialog(
    player: PlayerState,
    services: ScriptServices,
    dialogId: string,
    lines: string[],
    onContinue?: () => void,
    closeOnContinue?: boolean,
    onClose?: () => void,
): void {
    services.dialog.openDialog(player, {
        kind: "npc",
        id: dialogId,
        npcId: LUMBRIDGE_BOB_NPC_ID,
        npcName: "Bob",
        lines,
        clickToContinue: true,
        closeOnContinue: closeOnContinue ?? !onContinue,
        onContinue,
        onClose,
    });
}

function openPlayerDialog(
    player: PlayerState,
    services: ScriptServices,
    dialogId: string,
    lines: string[],
    onContinue?: () => void,
    closeOnContinue?: boolean,
    onClose?: () => void,
): void {
    services.dialog.openDialog(player, {
        kind: "player",
        id: dialogId,
        playerName: player.name ?? "You",
        lines,
        clickToContinue: true,
        closeOnContinue: closeOnContinue ?? !onContinue,
        onContinue,
        onClose,
    });
}

function openNoRepairableItemsDialog(
    player: PlayerState,
    services: ScriptServices,
    onClose?: () => void,
): void {
    const dialogId = `bob_${player.id}_repair_empty`;
    openBobDialog(
        player,
        services,
        dialogId,
        ["You don't have anything I can repair."],
        () => {
            services.dialog.closeDialog(player, dialogId);
            onClose?.();
        },
        true,
        onClose,
    );
}

export function registerBobHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    const activeConvos = new Set<number>();

    const releaseConversation = (playerId: number) => {
        activeConvos.delete(playerId);
    };

    const closeDialogAndRelease = (player: PlayerState, dialogId: string, onClose: () => void) => {
        services.dialog.closeDialog(player, dialogId);
        onClose();
    };

    const openMainOptions = (event: NpcInteractionEvent) => {
        const player = event.player;
        const pid = player.id;
        const dialogBase = `bob_${pid}`;
        const onClose = () => releaseConversation(pid);

        services.dialog.openDialogOptions(player, {
            id: `${dialogBase}_options`,
            title: "Select an Option",
            options: [
                "Give me a quest!",
                "Have you anything to sell?",
                "Can you repair my items for me?",
            ],
            onClose,
            onSelect: (choice) => {
                switch (choice) {
                    case 0:
                        openPlayerDialog(
                            player,
                            services,
                            `${dialogBase}_quest_player`,
                            ["Give me a quest!"],
                            () => {
                                const replyDialogId = `${dialogBase}_quest_bob`;
                                openBobDialog(
                                    player,
                                    services,
                                    replyDialogId,
                                    ["Get yer own!"],
                                    () => closeDialogAndRelease(player, replyDialogId, onClose),
                                    true,
                                    onClose,
                                );
                            },
                            false,
                            onClose,
                        );
                        break;
                    case 1:
                        openPlayerDialog(
                            player,
                            services,
                            `${dialogBase}_sell_player`,
                            ["Have you anything to sell?"],
                            () => {
                                const replyDialogId = `${dialogBase}_sell_bob`;
                                openBobDialog(
                                    player,
                                    services,
                                    replyDialogId,
                                    ["Yes! I buy and sell axes! Take your pick (or axe)!"],
                                    () => {
                                        closeDialogAndRelease(player, replyDialogId, onClose);
                                        services.shopping?.openShop?.(player, {
                                            npcTypeId: LUMBRIDGE_BOB_NPC_ID,
                                        });
                                    },
                                    true,
                                    onClose,
                                );
                            },
                            false,
                            onClose,
                        );
                        break;
                    case 2:
                        openPlayerDialog(
                            player,
                            services,
                            `${dialogBase}_repair_player`,
                            ["Can you repair my items for me?"],
                            () => {
                                const replyDialogId = `${dialogBase}_repair_bob`;
                                openBobDialog(
                                    player,
                                    services,
                                    replyDialogId,
                                    [
                                        "Of course I'll repair it, though the materials may cost you.",
                                        "Just hand me the item and I'll have a look.",
                                    ],
                                    () => closeDialogAndRelease(player, replyDialogId, onClose),
                                    true,
                                    onClose,
                                );
                            },
                            false,
                            onClose,
                        );
                        break;
                    default:
                        releaseConversation(pid);
                        break;
                }
            },
        });
    };

    const bobTalkHandler = (event: NpcInteractionEvent) => {
        const pid = event.player.id;
        if (activeConvos.has(pid)) return;
        activeConvos.add(pid);
        openMainOptions(event);
    };

    registry.registerNpcScript({
        npcId: LUMBRIDGE_BOB_NPC_ID,
        option: "talk-to",
        handler: bobTalkHandler,
    });

    registry.registerNpcScript({
        npcId: LUMBRIDGE_BOB_NPC_ID,
        option: "trade",
        handler: ({ player, services: svc, tick }) => {
            svc.combat.requestAction(
                player,
                {
                    kind: "npc.trade",
                    data: { npcTypeId: LUMBRIDGE_BOB_NPC_ID },
                    delayTicks: 0,
                    cooldownTicks: 0,
                    groups: ["npc.trade"],
                },
                tick,
            );
        },
    });

    registry.registerNpcScript({
        npcId: LUMBRIDGE_BOB_NPC_ID,
        option: "trade-with",
        handler: ({ player, services: svc, tick }) => {
            svc.combat.requestAction(
                player,
                {
                    kind: "npc.trade",
                    data: { npcTypeId: LUMBRIDGE_BOB_NPC_ID },
                    delayTicks: 0,
                    cooldownTicks: 0,
                    groups: ["npc.trade"],
                },
                tick,
            );
        },
    });

    registry.registerNpcScript({
        npcId: LUMBRIDGE_BOB_NPC_ID,
        option: "repair",
        handler: ({ player, services: svc }) => {
            openNoRepairableItemsDialog(player, svc);
        },
    });

    registry.registerNpcScript({
        npcId: LUMBRIDGE_BOB_NPC_ID,
        option: undefined,
        handler: bobTalkHandler,
    });
}
