import { CollisionFlag } from "../pathfinding/legacy/pathfinder/flag/CollisionFlag";

export type LocCollisionRect = {
    tile: { x: number; y: number };
    sizeX: number;
    sizeY: number;
};

export type LocCollisionFlagGetter = (
    worldX: number,
    worldY: number,
    level: number,
) => number | undefined;

const LOC_COLLISION_MASK = CollisionFlag.OBJECT | CollisionFlag.OBJECT_ROUTE_BLOCKER;

function normalizePositiveInt(value: number): number {
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.max(1, Math.trunc(value));
}

function hasLocCollision(
    getCollisionFlagAt: LocCollisionFlagGetter,
    x: number,
    y: number,
    level: number,
): boolean {
    const flag = getCollisionFlagAt(x, y, level);
    return flag !== undefined && (flag & LOC_COLLISION_MASK) !== 0;
}

export function deriveConnectedLocCollisionRect(
    getCollisionFlagAt: LocCollisionFlagGetter,
    tile: { x: number; y: number },
    sizeX: number,
    sizeY: number,
    level: number,
): LocCollisionRect | undefined {
    const originX = Math.trunc(tile.x);
    const originY = Math.trunc(tile.y);
    const width = normalizePositiveInt(sizeX);
    const height = normalizePositiveInt(sizeY);
    const searchSpan = Math.max(width, height);
    const searchMaxX = originX + searchSpan - 1;
    const searchMaxY = originY + searchSpan - 1;
    const seedMaxX = originX + width - 1;
    const seedMaxY = originY + height - 1;

    const queue: Array<{ x: number; y: number }> = [];
    const seen = new Set<string>();
    const push = (x: number, y: number): void => {
        if (x < originX || x > searchMaxX || y < originY || y > searchMaxY) {
            return;
        }
        const key = `${x},${y}`;
        if (seen.has(key)) {
            return;
        }
        if (!hasLocCollision(getCollisionFlagAt, x, y, level)) {
            return;
        }
        seen.add(key);
        queue.push({ x, y });
    };

    for (let x = originX; x <= seedMaxX; x++) {
        for (let y = originY; y <= seedMaxY; y++) {
            push(x, y);
        }
    }

    if (queue.length === 0) {
        return undefined;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        if (current.x < minX) minX = current.x;
        if (current.y < minY) minY = current.y;
        if (current.x > maxX) maxX = current.x;
        if (current.y > maxY) maxY = current.y;

        push(current.x - 1, current.y);
        push(current.x + 1, current.y);
        push(current.x, current.y - 1);
        push(current.x, current.y + 1);
    }

    return {
        tile: { x: minX, y: minY },
        sizeX: Math.max(1, maxX - minX + 1),
        sizeY: Math.max(1, maxY - minY + 1),
    };
}
