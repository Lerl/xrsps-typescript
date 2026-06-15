import type { InterfaceService } from "../../../src/widgets/InterfaceService";
import { BankLimits, BankMainChild, BankSideChild, WidgetGroup } from "./bankConstants";

export const BANK_INTERFACE_ID = WidgetGroup.BANK_MAIN;
export const BANK_SIDE_INTERFACE_ID = WidgetGroup.BANK_SIDE;
export const BANK_SIDE_ITEMS_COMPONENT = BankSideChild.ITEMS;

const EVENT_OP11 = 1 << 0;
const EVENT_DRAG_DEPTH_SHIFT = 17;
const EVENT_DRAG_TARGET = 1 << 20;
const EVENT_TARGET = 1 << 21;

function eventOp(op: number): number {
    return op === 11 ? EVENT_OP11 : 1 << op;
}

function eventOps(from: number, to: number): number {
    let flags = 0;
    for (let op = from; op <= to; op++) {
        flags |= eventOp(op);
    }
    return flags;
}

function eventDragDepth(depth: number): number {
    return depth << EVENT_DRAG_DEPTH_SHIFT;
}

export const BANK_CONTENT_FLAGS =
    eventOps(1, 11) | eventDragDepth(2) | EVENT_DRAG_TARGET | EVENT_TARGET;
export const BANK_CONTENT_TAB_TEXT_FLAGS = eventOp(1);
export const BANK_CONTENT_TAB_DROP_FLAGS = EVENT_DRAG_TARGET;

export const BANK_TAB_ALL_FLAGS = eventOp(1) | eventOp(7) | EVENT_DRAG_TARGET;
export const BANK_TAB_BUTTON_FLAGS =
    eventOp(1) | eventOp(6) | eventOp(7) | eventDragDepth(1) | EVENT_DRAG_TARGET;
export const BANK_SIDE_FLAGS =
    eventOps(1, 10) | eventDragDepth(1) | EVENT_DRAG_TARGET | EVENT_TARGET;
export const BANK_SIDE_BAG_FLAGS = eventOps(1, 7) | eventOp(10);
export const BANK_SIDE_WORN_FLAGS =
    eventOp(1) | eventOp(9) | eventOp(10) | eventDragDepth(1) | EVENT_DRAG_TARGET;
export const BANK_CONFIRM_FLAGS = eventOp(1);
export const BANK_POTIONSTORE_FLAGS = eventOps(1, 9);

const BANK_CONTENT_SLOT_START = 0;
const BANK_CONTENT_SLOT_END = BankLimits.MAX_SLOTS - 1;
const BANK_CONTENT_TAB_TEXT_SLOT_START = 1419;
const BANK_CONTENT_TAB_TEXT_SLOT_END = 1427;
const BANK_CONTENT_TAB_DROP_SLOT_START = 1428;
const BANK_CONTENT_TAB_DROP_SLOT_END = 1437;
const BANK_TAB_ALL_SLOT = 10;
const BANK_TAB_SLOT_START = 11;
const BANK_TAB_SLOT_END = 19;
const BANK_SIDE_SLOT_START = 0;
const BANK_SIDE_SLOT_END = 27;
const BANK_INCINERATOR_CONFIRM_SLOT_START = 1;
const BANK_INCINERATOR_CONFIRM_SLOT_END = BankLimits.MAX_SLOTS;
const BANK_DROPDOWN_OPTION_START = 0;
const BANK_DROPDOWN_OPTION_END = 8;
const BANK_POTIONSTORE_SLOT_START = 0;
const BANK_POTIONSTORE_SLOT_END = 578;

export const BANK_MODAL_INDICATOR_VARP = 548;
export const SCRIPT_BANK_INTERFACE_UNDERLAY = 917;

export interface BankOpenData {
    varps: Record<number, number>;
    varbits: Record<number, number>;
    capacityText?: string;
}

export function registerBankInterfaceHooks(interfaceService: InterfaceService): void {
    interfaceService.onInterfaceOpen(BANK_INTERFACE_ID, (player, ctx) => {
        const bankData = ctx.data as BankOpenData | undefined;

        ctx.service.openInventorySidePanel(player, {
            interfaceId: BANK_SIDE_INTERFACE_ID,
            varps: bankData?.varps,
            varbits: bankData?.varbits,
        });

        const bankContentWidgetUid = (BANK_INTERFACE_ID << 16) | BankMainChild.ITEMS;
        ctx.service.setWidgetFlags(
            player,
            bankContentWidgetUid,
            BANK_CONTENT_SLOT_START,
            BANK_CONTENT_SLOT_END,
            BANK_CONTENT_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            bankContentWidgetUid,
            BANK_CONTENT_TAB_TEXT_SLOT_START,
            BANK_CONTENT_TAB_TEXT_SLOT_END,
            BANK_CONTENT_TAB_TEXT_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            bankContentWidgetUid,
            BANK_CONTENT_TAB_DROP_SLOT_START,
            BANK_CONTENT_TAB_DROP_SLOT_END,
            BANK_CONTENT_TAB_DROP_FLAGS,
        );

        const bankTabsWidgetUid = (BANK_INTERFACE_ID << 16) | BankMainChild.TABS;
        ctx.service.setWidgetFlags(
            player,
            bankTabsWidgetUid,
            BANK_TAB_ALL_SLOT,
            BANK_TAB_ALL_SLOT,
            BANK_TAB_ALL_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            bankTabsWidgetUid,
            BANK_TAB_SLOT_START,
            BANK_TAB_SLOT_END,
            BANK_TAB_BUTTON_FLAGS,
        );

        const bankSideWidgetUid = (BANK_SIDE_INTERFACE_ID << 16) | BANK_SIDE_ITEMS_COMPONENT;
        ctx.service.setWidgetFlags(
            player,
            bankSideWidgetUid,
            BANK_SIDE_SLOT_START,
            BANK_SIDE_SLOT_END,
            BANK_SIDE_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            (BANK_SIDE_INTERFACE_ID << 16) | BankSideChild.LOOTING_BAG_ITEMS,
            BANK_SIDE_SLOT_START,
            BANK_SIDE_SLOT_END,
            BANK_SIDE_BAG_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            (BANK_SIDE_INTERFACE_ID << 16) | BankSideChild.LEAGUE_SECOND_INV_ITEMS,
            BANK_SIDE_SLOT_START,
            BANK_SIDE_SLOT_END,
            BANK_SIDE_BAG_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            (BANK_SIDE_INTERFACE_ID << 16) | BankSideChild.WORN_OPS,
            BANK_SIDE_SLOT_START,
            BANK_SIDE_SLOT_END,
            BANK_SIDE_WORN_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            (BANK_INTERFACE_ID << 16) | BankMainChild.INCINERATOR_CONFIRM,
            BANK_INCINERATOR_CONFIRM_SLOT_START,
            BANK_INCINERATOR_CONFIRM_SLOT_END,
            BANK_CONFIRM_FLAGS,
        );
        ctx.service.setWidgetFlags(
            player,
            (BANK_INTERFACE_ID << 16) | BankMainChild.DROPDOWN_CONTENT,
            BANK_DROPDOWN_OPTION_START,
            BANK_DROPDOWN_OPTION_END,
            BANK_CONFIRM_FLAGS,
        );
        if (bankData?.capacityText !== undefined) {
            ctx.service.setWidgetText(
                player,
                (BANK_INTERFACE_ID << 16) | BankMainChild.CAPACITY,
                bankData.capacityText,
            );
        }
        ctx.service.setWidgetFlags(
            player,
            (BANK_INTERFACE_ID << 16) | BankMainChild.POTIONSTORE_ITEMS,
            BANK_POTIONSTORE_SLOT_START,
            BANK_POTIONSTORE_SLOT_END,
            BANK_POTIONSTORE_FLAGS,
        );
    });

    interfaceService.onInterfaceClose(BANK_INTERFACE_ID, (player, ctx) => {
        ctx.service.restoreNormalInventory(player);
    });
}
