import type {
    IScriptRegistry,
    NpcInteractionEvent,
    ScriptServices,
} from "../../../../src/game/scripts/types";
import { type DialogueContext, startConversation } from "../../quests/dialogue";

const SHEARS_ITEM_ID = 1735;
const WOOL_ITEM_ID = 1737;
const HUMAN_SHEARING_ANIMATION_ID = 893;
const SHEAR_SHEEP_SOUND_ID = 761;
const STRANGE_SHEEP_NPC_ID = 731;
const SHEEP_REGROW_TICKS = 25;
const STRANGE_SHEEP_FLEE_STEPS = 3;
const STRANGE_SHEEP_ESCAPE_MESSAGE = "The... whatever it is... manages to get away from you!";

const SHORN_SHEEP_BY_SHEARABLE_TYPE = new Map<number, number>([
    [2693, 1178],
    [2694, 1299],
    [2695, 1300],
    [2696, 1301],
    [2697, 1302],
    [2698, 1303],
    [2699, 1304],
    [2786, 1308],
    [2787, 1309],
    [2788, 2691],
    [2789, 2692],
]);

interface PendingSheepRestore {
    shornNpcId: number;
    originalTypeId: number;
    restoreTick: number;
    x: number;
    y: number;
    level: number;
    wanderRadius: number;
}

type Direction = { dx: number; dy: number };

const FLEE_DIRECTIONS: Direction[] = [
    { dx: -1, dy: -1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
];

function handleSheepTalk(event: NpcInteractionEvent): void {
    const ctx: DialogueContext = {
        player: event.player,
        services: event.services,
        npcId: event.npc.typeId,
        npcName: "Sheep",
    };
    startConversation(ctx, [{ npc: ["Baa!"] }]);
}

function getFleeDirections(event: NpcInteractionEvent): Direction[] {
    const awayX = Math.sign(event.npc.tileX - event.player.tileX);
    const awayY = Math.sign(event.npc.tileY - event.player.tileY);
    return [...FLEE_DIRECTIONS].sort((a, b) => {
        const scoreA = a.dx * awayX + a.dy * awayY;
        const scoreB = b.dx * awayX + b.dy * awayY;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return Math.abs(b.dx) + Math.abs(b.dy) - (Math.abs(a.dx) + Math.abs(a.dy));
    });
}

function makeFleePath(event: NpcInteractionEvent): Array<{ x: number; y: number }> {
    const pathService = event.services.movement.getPathService();
    if (!pathService) return [];

    const path: Array<{ x: number; y: number }> = [];
    const directions = getFleeDirections(event);
    let x = event.npc.tileX;
    let y = event.npc.tileY;

    for (let i = 0; i < STRANGE_SHEEP_FLEE_STEPS; i++) {
        const step = directions
            .map((dir) => ({ x: x + dir.dx, y: y + dir.dy }))
            .find((tile) =>
                pathService.canNpcStep({ x, y, plane: event.npc.level }, tile, event.npc.size),
            );
        if (!step) break;
        path.push(step);
        x = step.x;
        y = step.y;
    }

    return path;
}

function handleStrangeSheepShear(event: NpcInteractionEvent): void {
    const { player, services, npc } = event;
    if (!services.inventory.playerHasItem(player, SHEARS_ITEM_ID)) {
        services.messaging.sendGameMessage(player, "You need a pair of shears to shear the sheep.");
        return;
    }

    services.animation.playPlayerSeq(player, HUMAN_SHEARING_ANIMATION_ID);
    services.messaging.sendGameMessage(player, STRANGE_SHEEP_ESCAPE_MESSAGE);

    const fleePath = makeFleePath(event);
    if (fleePath.length > 0) {
        npc.setPath(fleePath, false);
    }
}

function shearSheep(
    event: NpcInteractionEvent,
    pendingRestores: Map<number, PendingSheepRestore>,
): void {
    const { player, services, npc, tick } = event;
    const shornTypeId = SHORN_SHEEP_BY_SHEARABLE_TYPE.get(npc.typeId);
    if (shornTypeId === undefined) return;

    if (!services.inventory.playerHasItem(player, SHEARS_ITEM_ID)) {
        services.messaging.sendGameMessage(player, "You need a pair of shears to shear the sheep.");
        return;
    }

    if (!services.inventory.canStoreItem(player, WOOL_ITEM_ID)) {
        services.messaging.sendGameMessage(
            player,
            "You don't have enough inventory space to hold the wool.",
        );
        return;
    }

    services.animation.playPlayerSeq(player, HUMAN_SHEARING_ANIMATION_ID);
    services.sound.playAreaSound({
        soundId: SHEAR_SHEEP_SOUND_ID,
        tile: { x: npc.tileX, y: npc.tileY },
        level: npc.level,
        radius: 5,
    });

    const originalTypeId = npc.typeId;
    const x = npc.tileX;
    const y = npc.tileY;
    const level = npc.level;
    const wanderRadius = npc.wanderRadius;

    if (!services.npc.removeNpc(npc.id)) {
        return;
    }

    const shorn = services.npc.spawnNpc({
        id: shornTypeId,
        name: "Sheep",
        x,
        y,
        level,
        wanderRadius,
    });
    if (!shorn) {
        services.npc.spawnNpc({
            id: originalTypeId,
            name: "Sheep",
            x,
            y,
            level,
            wanderRadius,
        });
        return;
    }

    const addResult = services.inventory.addItemToInventory(player, WOOL_ITEM_ID, 1);
    if (addResult.added <= 0) {
        pendingRestores.delete(shorn.id);
        services.npc.removeNpc(shorn.id);
        services.npc.spawnNpc({
            id: originalTypeId,
            name: "Sheep",
            x,
            y,
            level,
            wanderRadius,
        });
        services.inventory.snapshotInventory(player);
        services.messaging.sendGameMessage(
            player,
            "You don't have enough inventory space to hold the wool.",
        );
        return;
    }
    services.inventory.snapshotInventory(player);
    services.messaging.sendGameMessage(player, "You get some wool.");
    services.npc.faceNpcToPlayer(shorn, player);
    services.npc.queueNpcForcedChat(shorn, "Baa!");

    pendingRestores.set(shorn.id, {
        shornNpcId: shorn.id,
        originalTypeId,
        restoreTick: tick + SHEEP_REGROW_TICKS,
        x,
        y,
        level,
        wanderRadius,
    });
}

function restoreDueSheep(
    tick: number,
    services: ScriptServices,
    pendingRestores: Map<number, PendingSheepRestore>,
): void {
    for (const restore of Array.from(pendingRestores.values())) {
        if (tick < restore.restoreTick) continue;
        pendingRestores.delete(restore.shornNpcId);

        const shornNpc = services.combat.getNpc(restore.shornNpcId);
        const x = shornNpc?.tileX ?? restore.x;
        const y = shornNpc?.tileY ?? restore.y;
        const level = shornNpc?.level ?? restore.level;

        if (shornNpc) {
            services.npc.removeNpc(shornNpc.id);
        }

        services.npc.spawnNpc({
            id: restore.originalTypeId,
            name: "Sheep",
            x,
            y,
            level,
            wanderRadius: restore.wanderRadius,
        });
    }
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    const pendingRestores = new Map<number, PendingSheepRestore>();

    registry.registerNpcScript({
        npcId: STRANGE_SHEEP_NPC_ID,
        option: "shear",
        handler: handleStrangeSheepShear,
    });

    for (const sheepTypeId of SHORN_SHEEP_BY_SHEARABLE_TYPE.keys()) {
        registry.registerNpcScript({
            npcId: sheepTypeId,
            option: "shear",
            handler: (event) => shearSheep(event, pendingRestores),
        });
    }

    registry.registerNpcScript({
        npcId: STRANGE_SHEEP_NPC_ID,
        option: "talk-to",
        handler: handleSheepTalk,
    });

    registry.registerTickHandler(({ tick, services }) => {
        restoreDueSheep(tick, services, pendingRestores);
    });
}
