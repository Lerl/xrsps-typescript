import type { MessageHandlerServices } from "../MessageHandlers";
import type { MessageHandler } from "../MessageRouter";

export function createIfCloseHandler(services: MessageHandlerServices): MessageHandler<"if_close"> {
    return (ctx) => {
        const player = services.getPlayer(ctx.ws);
        if (player) {
            services.closeInterruptibleInterfaces(player);
        }
    };
}
