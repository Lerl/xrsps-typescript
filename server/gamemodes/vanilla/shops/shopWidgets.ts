import { VARBIT_SHOP_QUANTITY } from "../../../../src/shared/vars";
import {
    type IScriptRegistry,
    type ScriptServices,
    type WidgetActionEvent,
} from "../../../src/game/scripts/types";
import {
    SHOP_INTERFACE_ID,
    SHOP_INVENTORY_INTERFACE_ID,
    SHOP_STOCK_COMPONENT,
} from "./shopConstants";

// Widget UIDs for shop stock (300:16) and shop inventory (301:0)
const SHOP_STOCK_WIDGET_ID = (SHOP_INTERFACE_ID << 16) | SHOP_STOCK_COMPONENT;
const SHOP_INVENTORY_WIDGET_ID = SHOP_INVENTORY_INTERFACE_ID << 16;

/**
 * Shop button numbers (opId).
 *
 * Shop stock (300:16):
 * - Button 1 (IF_BUTTON1) = Value, or current Buy quantity when shop_quantity > 0
 * - Button 2 (IF_BUTTON2) = Buy 1
 * - Button 3 (IF_BUTTON3) = Buy 5
 * - Button 4 (IF_BUTTON4) = Buy 10
 * - Button 5 (IF_BUTTON5) = Buy 50
 * - Button 6 (IF_BUTTON6) = Value when shop_quantity > 0
 *
 * Shop inventory (301:0):
 * - Button 1 (IF_BUTTON1) = Value
 * - Button 2 (IF_BUTTON2) = Sell 1
 * - Button 3 (IF_BUTTON3) = Sell 5
 * - Button 4 (IF_BUTTON4) = Sell 10
 * - Button 5 (IF_BUTTON5) = Sell 50
 */
const SHOP_OP_VALUE = 1;
const SHOP_OP_QTY_1 = 2;
const SHOP_OP_QTY_5 = 3;
const SHOP_OP_QTY_10 = 4;
const SHOP_OP_QTY_50 = 5;
const SHOP_OP_SELECTED_VALUE = 6;

/** Maps buttonNum to quantity */
const BUTTON_TO_QUANTITY: Record<number, number> = {
    [SHOP_OP_QTY_1]: 1,
    [SHOP_OP_QTY_5]: 5,
    [SHOP_OP_QTY_10]: 10,
    [SHOP_OP_QTY_50]: 50,
};

const SHOP_QUANTITY_TO_BUY_QUANTITY: Record<number, number> = {
    1: 1,
    2: 5,
    3: 10,
    4: 50,
};

function formatCoins(amount: number): string {
    if (amount === 0) return "free";
    return amount === 1 ? "1 coin" : `${amount.toLocaleString()} coins`;
}

/**
 * Convert shop widget childIndex to 0-indexed slot.
 * OSRS shop stock widgets use 1-indexed children (slot 0 = childIndex 1).
 */
function childIndexToSlot(childIndex: number): number {
    return childIndex - 1;
}

export function registerShopWidgetHandlers(
    registry: IScriptRegistry,
    _services: ScriptServices,
): void {
    // ========================================
    // SHOP STOCK (300:16) - Buying items
    // ========================================

    const handleStockValue = ({ player, services, slot }: WidgetActionEvent) => {
        if (slot === undefined) return;
        const slotIndex = childIndexToSlot(slot);
        if (slotIndex < 0) return;
        const info = services.shopping?.getShopSlotValue?.(player, slotIndex);
        if (info) {
            const priceText =
                info.buyPrice === 0
                    ? "is currently free"
                    : `currently costs ${formatCoins(info.buyPrice)}`;
            services.messaging.sendGameMessage(player, `${info.itemName}: ${priceText}.`);
        }
    };

    const buyStock = ({ player, services, slot }: WidgetActionEvent, quantity: number) => {
        if (slot === undefined) return;
        const slotIndex = childIndexToSlot(slot);
        if (slotIndex < 0) return;
        services.shopping?.buyFromShop?.(player, { slotIndex, quantity });
    };

    const handleStockBuy = (quantity: number) => {
        return (event: WidgetActionEvent) => buyStock(event, quantity);
    };

    const handleStockPrimary = (event: WidgetActionEvent) => {
        const selectedQuantity = event.player.varps.getVarbitValue(VARBIT_SHOP_QUANTITY) | 0;
        const quantity = SHOP_QUANTITY_TO_BUY_QUANTITY[selectedQuantity];
        if (quantity !== undefined) {
            buyStock(event, quantity);
            return;
        }
        handleStockValue(event);
    };

    // Shop stock "Value" option (button 1 by default, button 6 after quantity selection)
    registry.registerWidgetAction({
        widgetId: SHOP_STOCK_WIDGET_ID,
        opId: SHOP_OP_VALUE,
        handler: handleStockPrimary,
    });
    registry.registerWidgetAction({
        widgetId: SHOP_STOCK_WIDGET_ID,
        opId: SHOP_OP_SELECTED_VALUE,
        handler: handleStockValue,
    });

    // Shop stock buy buttons (buttons 2-5)
    for (const opId of [SHOP_OP_QTY_1, SHOP_OP_QTY_5, SHOP_OP_QTY_10, SHOP_OP_QTY_50]) {
        const quantity = BUTTON_TO_QUANTITY[opId];
        registry.registerWidgetAction({
            widgetId: SHOP_STOCK_WIDGET_ID,
            opId,
            handler: handleStockBuy(quantity),
        });
    }

    // ========================================
    // SHOP INVENTORY (301:0) - Selling items
    // ========================================

    // Inventory "Value" option (button 1)
    registry.registerWidgetAction({
        widgetId: SHOP_INVENTORY_WIDGET_ID,
        opId: SHOP_OP_VALUE,
        handler: ({ player, services, itemId }) => {
            if (itemId === undefined || itemId <= 0) return;
            const info = services.shopping?.getInventoryItemSellValue?.(player, itemId);
            if (info) {
                const priceText =
                    info.sellPrice === 0
                        ? "shop will buy for free"
                        : `shop will buy for ${formatCoins(info.sellPrice)}`;
                services.messaging.sendGameMessage(player, `${info.itemName}: ${priceText}.`);
            }
        },
    });

    // Inventory sell buttons (buttons 2-5)
    for (const opId of [SHOP_OP_QTY_1, SHOP_OP_QTY_5, SHOP_OP_QTY_10, SHOP_OP_QTY_50]) {
        const quantity = BUTTON_TO_QUANTITY[opId];
        registry.registerWidgetAction({
            widgetId: SHOP_INVENTORY_WIDGET_ID,
            opId,
            handler: ({ player, services, slot, itemId }) => {
                if (slot === undefined || itemId === undefined) return;
                services.shopping?.sellToShop?.(player, {
                    inventorySlot: slot,
                    itemId: itemId,
                    quantity,
                });
            },
        });
    }
}
