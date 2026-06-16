import { type PlayerState } from "../../../src/game/player";
import {
    type IScriptRegistry,
    type ScriptServices,
    type WidgetActionEvent,
} from "../../../src/game/scripts/types";
import { EquipmentSlot } from "../../../../src/rs/config/player/Equipment";
import {
    BankLimits,
    BankMainChild,
    BankSideChild,
    BankVarbit,
    WidgetGroup,
    slotToTabIndex,
} from "./bankConstants";

const BANK_GROUP_ID = WidgetGroup.BANK_MAIN;
const BANKSIDE_GROUP_ID = WidgetGroup.BANK_SIDE;

const packWidgetId = (group: number, child: number) => ((group & 0xffff) << 16) | (child & 0xffff);

const BANK_WIDGET_ITEMS = packWidgetId(BANK_GROUP_ID, BankMainChild.ITEMS);
const BANK_WIDGET_DEPOSIT_INV = packWidgetId(BANK_GROUP_ID, BankMainChild.DEPOSIT_INVENTORY);
const BANK_WIDGET_DEPOSIT_WORN = packWidgetId(BANK_GROUP_ID, BankMainChild.DEPOSIT_WORN);
const BANK_WIDGET_TABS = packWidgetId(BANK_GROUP_ID, BankMainChild.TABS);
const BANK_WIDGET_DROPDOWN_CONTENT = packWidgetId(BANK_GROUP_ID, BankMainChild.DROPDOWN_CONTENT);
const BANKSIDE_ITEMS = packWidgetId(BANKSIDE_GROUP_ID, BankSideChild.ITEMS);
const BANK_FILLER_ITEM_ID = 20594;
const BANKSIDE_DYNAMIC_CHILD_START = 0x8000;
const BANK_WORN_SLOTS: ReadonlyArray<{ child: number; slot: EquipmentSlot }> = [
    { child: BankMainChild.WORN_SLOT_HEAD, slot: EquipmentSlot.HEAD },
    { child: BankMainChild.WORN_SLOT_CAPE, slot: EquipmentSlot.CAPE },
    { child: BankMainChild.WORN_SLOT_AMULET, slot: EquipmentSlot.AMULET },
    { child: BankMainChild.WORN_SLOT_WEAPON, slot: EquipmentSlot.WEAPON },
    { child: BankMainChild.WORN_SLOT_BODY, slot: EquipmentSlot.BODY },
    { child: BankMainChild.WORN_SLOT_SHIELD, slot: EquipmentSlot.SHIELD },
    { child: BankMainChild.WORN_SLOT_LEGS, slot: EquipmentSlot.LEGS },
    { child: BankMainChild.WORN_SLOT_GLOVES, slot: EquipmentSlot.GLOVES },
    { child: BankMainChild.WORN_SLOT_BOOTS, slot: EquipmentSlot.BOOTS },
    { child: BankMainChild.WORN_SLOT_RING, slot: EquipmentSlot.RING },
    { child: BankMainChild.WORN_SLOT_AMMO, slot: EquipmentSlot.AMMO },
];

const requestedQuantityOrZero = (player: PlayerState): number => {
    const requested = Math.trunc(player.bank.getBankCustomQuantity());
    return requested > 0 ? requested : 0;
};

const quantityForDefaultMode = (player: PlayerState, available: number): number => {
    const total = Math.max(0, available);
    switch (player.bank.getBankQuantityMode()) {
        case 0:
            return total > 0 ? 1 : 0;
        case 1:
            return Math.min(5, Math.max(1, total));
        case 2:
            return Math.min(10, Math.max(1, total));
        case 3: {
            const desired = Math.max(1, requestedQuantityOrZero(player));
            return Math.min(total, Math.max(1, desired));
        }
        case 4:
            return total;
        default:
            return total > 0 ? 1 : 0;
    }
};

const quantityForWithdrawOp = (player: PlayerState, opId: number, available: number): number => {
    const total = Math.max(0, available);
    const requested = requestedQuantityOrZero(player);
    switch (opId) {
        case 1:
            return quantityForDefaultMode(player, total);
        case 2:
            return total > 0 ? 1 : 0;
        case 3:
            return Math.min(5, Math.max(1, total));
        case 4:
            return Math.min(10, Math.max(1, total));
        case 5:
        case 6:
            return requested > 0 ? Math.min(total, requested) : 0;
        case 7:
            return total;
        case 8:
            return total > 0 ? Math.max(0, total - 1) : 0;
        default:
            return 0;
    }
};

const quantityForDepositOp = (player: PlayerState, opId: number, available: number): number => {
    const total = Math.max(0, available);
    const requested = requestedQuantityOrZero(player);
    switch (opId) {
        case 2:
            return quantityForDefaultMode(player, total);
        case 3:
            return total > 0 ? 1 : 0;
        case 4:
            return Math.min(5, Math.max(1, total));
        case 5:
            return Math.min(10, Math.max(1, total));
        case 6:
        case 7:
            return requested > 0 ? Math.min(total, requested) : 0;
        case 8:
            return total;
        default:
            return 0;
    }
};

const quantityForDepositOption = (
    player: PlayerState,
    option: string | undefined,
    available: number,
): number => {
    const total = Math.max(0, available);
    const normalized = option?.trim().toLowerCase();
    if (!normalized) return 0;
    if (normalized === "deposit-1") return total > 0 ? 1 : 0;
    if (normalized === "deposit-5") return Math.min(5, Math.max(1, total));
    if (normalized === "deposit-10") return Math.min(10, Math.max(1, total));
    if (normalized === "deposit-all") return total;
    if (normalized === "deposit-x") return 0;

    const customMatch = /^deposit-(\d+)$/.exec(normalized);
    if (customMatch) {
        const requested = Math.trunc(Number(customMatch[1]));
        return requested > 0 ? Math.min(total, requested) : 0;
    }

    return quantityForDefaultMode(player, total);
};

const tabIndexForWidgetSlot = (slot: number | undefined): number | undefined => {
    if (slot === undefined || !Number.isFinite(slot)) return undefined;
    const tab = slotToTabIndex(slot);
    return tab >= 0 && tab <= BankLimits.MAX_TABS ? tab : undefined;
};

const tabDisplayModeForDropdownSlot = (slot: number | undefined): number | undefined => {
    if (slot === undefined || !Number.isFinite(slot)) return undefined;
    const raw = Math.trunc(slot);
    const mode = raw >= 1 && raw % 2 === 1 ? Math.trunc((raw - 1) / 2) : raw;
    return mode >= 0 && mode <= 3 ? mode : undefined;
};

const handleWithdrawOp = (event: WidgetActionEvent, opId: number): void => {
    if (event.groupId !== BANK_GROUP_ID) return;
    if (event.slot === undefined) return;

    const { player, services } = event;

    const entry = services.banking?.getBankEntryAtClientSlot?.(player, event.slot);
    if (!entry || entry.itemId <= 0 || entry.quantity <= 0) return;

    if (event.itemId !== undefined && event.itemId > 0 && event.itemId !== entry.itemId) {
        return;
    }

    const quantity = quantityForWithdrawOp(player, opId, entry.quantity);
    if (!(quantity > 0)) return;

    const noted = player.bank.getBankWithdrawNotes();
    const result = services.banking!.withdrawFromBankSlot!(player, event.slot, quantity, { noted });
    if (!result.ok && result.message) {
        services.messaging.sendGameMessage(player, result.message);
    }
};

const handleReleasePlaceholderOp = (event: WidgetActionEvent): boolean => {
    if (event.groupId !== BANK_GROUP_ID) return false;
    if (event.slot === undefined) return false;
    return !!event.services.banking?.releasePlaceholder?.(event.player, event.slot, event.itemId);
};

const handleTabOp = (event: WidgetActionEvent, opId: number): void => {
    if (event.groupId !== BANK_GROUP_ID) return;
    const tab = tabIndexForWidgetSlot(event.slot);
    if (tab === undefined) return;

    switch (opId) {
        case 1:
            event.services.banking?.setCurrentTab?.(event.player, tab);
            return;
        case 6:
            if (tab > 0) {
                event.services.banking?.collapseTab?.(event.player, tab);
            }
            return;
        case 7:
            event.services.banking?.releasePlaceholders?.(
                event.player,
                tab > 0 ? tab : undefined,
            );
            return;
        default:
            return;
    }
};

const handleBankWornSlotOp = (
    event: WidgetActionEvent,
    slot: EquipmentSlot,
    action: "remove" | "bank",
): void => {
    if (event.groupId !== BANK_GROUP_ID) return;
    if (action === "remove") {
        event.services.banking?.removeEquipmentSlot?.(event.player, slot);
        return;
    }
    event.services.banking?.depositEquipmentSlotToBank?.(event.player, slot);
};

function registerMainBankWidgets(registry: IScriptRegistry): void {
    const guard = (
        option: string,
        handler: (args: {
            player: PlayerState;
            services: ScriptServices;
            event: WidgetActionEvent;
        }) => void,
    ) =>
        registry.registerWidgetAction({
            option,
            handler: (event) => {
                if (event.groupId !== BANK_GROUP_ID) return;
                handler({ player: event.player, services: event.services, event });
            },
        });

    for (const opId of [1, 6, 7]) {
        registry.registerWidgetAction({
            widgetId: BANK_WIDGET_TABS,
            opId,
            handler: (event) => handleTabOp(event, opId),
        });
    }

    registry.registerWidgetAction({
        widgetId: BANK_WIDGET_DROPDOWN_CONTENT,
        opId: 1,
        handler: (event) => {
            if (event.groupId !== BANK_GROUP_ID) return;
            const mode = tabDisplayModeForDropdownSlot(event.slot);
            if (mode === undefined) return;
            event.services.banking?.setTabDisplayMode?.(event.player, mode);
        },
    });

    guard("View tab", ({ event }) => handleTabOp(event, 1));
    guard("View all items", ({ event }) => handleTabOp(event, 1));
    guard("Collapse tab", ({ event }) => handleTabOp(event, 6));
    guard("Remove placeholders", ({ event }) => handleTabOp(event, 7));

    registry.registerWidgetAction({
        widgetId: BANK_WIDGET_DEPOSIT_INV,
        handler: ({ player, services, groupId }) => {
            if (groupId !== BANK_GROUP_ID) return;
            services.banking?.depositInventoryToBank?.(player);
        },
    });

    registry.registerWidgetAction({
        widgetId: BANK_WIDGET_DEPOSIT_WORN,
        handler: ({ player, services, groupId }) => {
            if (groupId !== BANK_GROUP_ID) return;
            services.banking?.depositEquipmentToBank?.(player);
        },
    });

    for (const { child, slot } of BANK_WORN_SLOTS) {
        const widgetId = packWidgetId(BANK_GROUP_ID, child);
        registry.registerWidgetAction({
            widgetId,
            opId: 1,
            handler: (event) => handleBankWornSlotOp(event, slot, "remove"),
        });
        registry.registerWidgetAction({
            widgetId,
            opId: 2,
            handler: (event) => handleBankWornSlotOp(event, slot, "bank"),
        });
        registry.registerWidgetAction({
            widgetId,
            option: "Remove",
            handler: (event) => handleBankWornSlotOp(event, slot, "remove"),
        });
        registry.registerWidgetAction({
            widgetId,
            option: "Bank",
            handler: (event) => handleBankWornSlotOp(event, slot, "bank"),
        });
    }

    registry.onButton(BANK_GROUP_ID, BankMainChild.SWAP_INSERT_BUTTON, ({ player, services }) => {
        const next = !player.bank.getBankInsertMode();
        player.bank.setBankInsertMode(next);
        services.variables.sendVarbit?.(player, BankVarbit.INSERT_MODE, next ? 1 : 0);
    });

    registry.onButton(BANK_GROUP_ID, BankMainChild.NOTE_BUTTON, ({ player, services }) => {
        const next = !player.bank.getBankWithdrawNotes();
        player.bank.setBankWithdrawNotes(next);
        services.variables.sendVarbit?.(player, BankVarbit.WITHDRAW_NOTES, next ? 1 : 0);
    });

    const setQuantityMode = (player: PlayerState, services: ScriptServices, mode: number) => {
        player.bank.setBankQuantityMode(mode);
        services.variables.sendVarbit?.(player, BankVarbit.QUANTITY_TYPE, mode);
    };

    registry.onButton(BANK_GROUP_ID, BankMainChild.QUANTITY_ONE_BUTTON, ({ player, services }) => {
        setQuantityMode(player, services, 0);
    });

    registry.onButton(BANK_GROUP_ID, BankMainChild.QUANTITY_FIVE_BUTTON, ({ player, services }) => {
        setQuantityMode(player, services, 1);
    });

    registry.onButton(BANK_GROUP_ID, BankMainChild.QUANTITY_TEN_BUTTON, ({ player, services }) => {
        setQuantityMode(player, services, 2);
    });

    registry.onButton(BANK_GROUP_ID, BankMainChild.QUANTITY_X_BUTTON, ({ player, services }) => {
        setQuantityMode(player, services, 3);
    });

    registry.onButton(BANK_GROUP_ID, BankMainChild.QUANTITY_ALL_BUTTON, ({ player, services }) => {
        setQuantityMode(player, services, 4);
    });

    registry.onButton(BANK_GROUP_ID, BankMainChild.PLACEHOLDER_BUTTON, ({ player, services }) => {
        const next = !player.bank.getBankPlaceholderMode();
        player.bank.setBankPlaceholderMode(next);
        services.variables.sendVarbit?.(player, BankVarbit.LEAVE_PLACEHOLDERS, next ? 1 : 0);
    });

    guard("Placeholders", ({ player, services }) => {
        const next = !player.bank.getBankPlaceholderMode();
        player.bank.setBankPlaceholderMode(next);
        services.variables.sendVarbit?.(player, BankVarbit.LEAVE_PLACEHOLDERS, next ? 1 : 0);
    });

    guard("Release placeholders", ({ player, services }) => {
        services.banking?.releasePlaceholders?.(player);
    });

    guard("Search", () => {});

    registry.onButton(BANK_GROUP_ID, BankMainChild.SEARCH, () => {});

    registry.onButton(BANK_GROUP_ID, BankMainChild.CLOSE_BUTTON, ({ player, services }) => {
        services.dialog.closeModal(player);
    });

    guard("Fillers", ({ player, services }) => {
        if (!player?.bank) return;
        const bank = player.bank.getBankEntries();
        let filled = 0;
        for (const entry of bank) {
            if (!entry) continue;
            if (entry.itemId <= 0 && !entry.filler) {
                entry.itemId = BANK_FILLER_ITEM_ID;
                entry.quantity = 0;
                entry.placeholder = false;
                entry.filler = true;
                filled++;
            }
        }
        if (filled > 0) {
            services.banking?.queueBankSnapshot?.(player);
        }
    });

    guard("Release fillers", ({ player, services }) => {
        if (!player?.bank) return;
        const bank = player.bank.getBankEntries();
        let cleared = 0;
        for (const entry of bank) {
            if (!entry) continue;
            if (entry.filler) {
                entry.itemId = -1;
                entry.quantity = 0;
                entry.placeholder = false;
                entry.filler = false;
                cleared++;
            }
        }
        if (cleared > 0) {
            services.banking?.queueBankSnapshot?.(player);
        }
    });

    for (const opId of [1, 2, 3, 4, 5, 6, 7, 8]) {
        registry.registerWidgetAction({
            widgetId: BANK_WIDGET_ITEMS,
            opId,
            handler: (event) => {
                if (opId === 8 && handleReleasePlaceholderOp(event)) return;
                handleWithdrawOp(event, opId);
            },
        });
    }

    guard("Withdraw-1", ({ event }) => handleWithdrawOp(event, 2));

    for (const [option, opId] of Object.entries({
        "Withdraw-5": 3,
        "Withdraw-10": 4,
        "Withdraw-X": 6,
        "Withdraw-All": 7,
        "Withdraw-All-but-1": 8,
    })) {
        guard(option, ({ event }) => handleWithdrawOp(event, opId));
    }

    guard("Release", ({ event }) => {
        handleReleasePlaceholderOp(event);
    });
}

function registerBanksideWidgets(registry: IScriptRegistry): void {
    const handleDeposit = (event: WidgetActionEvent) => {
        if (event.groupId !== BANKSIDE_GROUP_ID) return;
        const isItemsComponent = event.widgetId === BANKSIDE_ITEMS;
        const isRuntimeItemChild =
            event.childId >= BANKSIDE_DYNAMIC_CHILD_START && event.slot !== undefined;
        if (!isItemsComponent && !isRuntimeItemChild) return;

        const slot = event.slot;
        if (slot === undefined || slot < 0) return;

        const inv = event.player.getInventoryEntries();
        const entry = inv[slot];
        const available = entry && entry.quantity > 0 ? entry.quantity : 0;
        if (available <= 0) return;

        const opId = event.opId;
        const desired =
            opId !== undefined
                ? quantityForDepositOp(event.player, opId, available)
                : quantityForDepositOption(event.player, event.option, available);

        if (!desired || desired <= 0) return;

        const result = event.services.banking?.depositInventoryItemToBank?.(
            event.player,
            slot,
            desired,
            {
                itemIdHint: event.itemId,
            },
        );

        if (result && result.ok === false && result.message) {
            event.services.messaging.sendGameMessage(event.player, String(result.message));
        }
    };

    for (const opId of [2, 3, 4, 5, 6, 7, 8]) {
        registry.registerWidgetAction({
            widgetId: BANKSIDE_ITEMS,
            opId,
            handler: handleDeposit,
        });
    }

    for (const option of ["Deposit-1", "Deposit-5", "Deposit-10", "Deposit-X", "Deposit-All"]) {
        registry.registerWidgetAction({
            option,
            handler: (event) => {
                if (event.widgetId === BANKSIDE_ITEMS) return;
                handleDeposit(event);
            },
        });
    }
}

export function registerBankWidgetHandlers(
    registry: IScriptRegistry,
    _services: ScriptServices,
): void {
    registerMainBankWidgets(registry);
    registerBanksideWidgets(registry);
}
