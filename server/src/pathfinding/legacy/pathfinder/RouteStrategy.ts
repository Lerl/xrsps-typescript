export abstract class RouteStrategy {
    // Used by A* Heuristic to determine "Distance Remaining"
    approxDestX: number = 0;
    approxDestY: number = 0;

    // Dimensions of the target area (usually for rendering or debug)
    destSizeX: number = 1;
    destSizeY: number = 1;

    /**
     * Client parity: the deob signature is hasArrived(size, x, y, collisionData).
     * The mover size is passed last (optional, default 1) so size-1 call sites
     * stay simple; (tileX, tileY) is the mover's SOUTH-WEST tile and the
     * footprint spans size x size tiles (OSRS movers are square).
     */
    abstract hasArrived(tileX: number, tileY: number, level: number, size?: number): boolean;
}

/** Does a size x size mover footprint at (tileX, tileY) overlap the rect? */
function footprintOverlaps(
    tileX: number,
    tileY: number,
    size: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
): boolean {
    return tileX <= maxX && tileX + size - 1 >= minX && tileY <= maxY && tileY + size - 1 >= minY;
}

export class ExactRouteStrategy extends RouteStrategy {
    // Deob ApproximateRouteStrategy.hasArrived ignores the mover size.
    hasArrived(tileX: number, tileY: number, level: number, _size: number = 1): boolean {
        return tileX === this.approxDestX && tileY === this.approxDestY;
    }
}

// Client parity: ApproximateRouteStrategy is the default "walk to tile" strategy and only
// checks for exact tile arrival (the deob implementation ignores the mover size).
export class ApproximateRouteStrategy extends RouteStrategy {
    constructor(destX: number, destY: number) {
        super();
        this.approxDestX = destX;
        this.approxDestY = destY;
        this.destSizeX = 1;
        this.destSizeY = 1;
    }

    hasArrived(tileX: number, tileY: number, _level: number, _size: number = 1): boolean {
        return tileX === this.approxDestX && tileY === this.approxDestY;
    }
}

// Simple rectangle containment (used for "stand on" interactions like floor decorations).
export class RectRouteStrategy extends RouteStrategy {
    private readonly minX: number;
    private readonly minY: number;
    private readonly maxX: number;
    private readonly maxY: number;

    constructor(rectX: number, rectY: number, sizeX: number, sizeY: number) {
        super();
        this.minX = rectX;
        this.minY = rectY;
        this.destSizeX = Math.max(1, sizeX);
        this.destSizeY = Math.max(1, sizeY);
        this.maxX = this.minX + this.destSizeX - 1;
        this.maxY = this.minY + this.destSizeY - 1;

        // Client parity: approxDestX/Y represent the SOUTH-WEST corner (used for alternative route search).
        this.approxDestX = this.minX;
        this.approxDestY = this.minY;
    }

    // OSRS (rsmod reachRectangle "collides"): a size-N mover stands on the area
    // when its footprint overlaps the rect, not just its south-west tile.
    hasArrived(tileX: number, tileY: number, _level: number, size: number = 1): boolean {
        const s = Math.max(1, size | 0);
        return footprintOverlaps(tileX, tileY, s, this.minX, this.minY, this.maxX, this.maxY);
    }
}

/** Type for collision flag getter function used by wall-aware route strategies. */
export type CollisionFlagGetter = (x: number, y: number, plane: number) => number | undefined;
export type ProjectileRaycastGetter = (
    from: { x: number; y: number; plane: number },
    to: { x: number; y: number },
) => { clear: boolean; tiles: number };

export type CardinalBlockedSides = {
    north?: boolean;
    east?: boolean;
    south?: boolean;
    west?: boolean;
};

// Collision flags needed for wall checks (duplicated here to avoid circular imports)
const WALL_NORTH = 0x2;
const WALL_SOUTH = 0x20;
const WALL_EAST = 0x8;
const WALL_WEST = 0x80;

// Matches OSRS Interaction logic.
// OSRS does NOT allow diagonal interactions with objects.
// You must be cardinally adjacent (N/S/E/W) to interact.
// Also checks that no wall blocks the interaction edge.
export class RectAdjacentRouteStrategy extends RouteStrategy {
    private collisionGetter?: CollisionFlagGetter;
    private plane: number = 0;

    constructor(
        private rectX: number,
        private rectY: number,
        private sizeX: number,
        private sizeY: number,
        private allowOverlap: boolean = false,
        private allowLargeDiagonal: boolean = false,
    ) {
        super();
        // Client parity: approxDestX/Y represent the SOUTH-WEST corner.
        this.approxDestX = rectX;
        this.approxDestY = rectY;
        this.destSizeX = Math.max(1, sizeX);
        this.destSizeY = Math.max(1, sizeY);
    }

    /**
     * Set a collision flag getter to enable wall checking.
     * When set, hasArrived() will also verify no wall blocks the interaction edge.
     */
    setCollisionGetter(getter: CollisionFlagGetter, plane: number): void {
        this.collisionGetter = getter;
        this.plane = plane;
    }

    hasArrived(tileX: number, tileY: number, _level: number, size: number = 1): boolean {
        const s = Math.max(1, size | 0);
        const minX = this.rectX;
        const minY = this.rectY;
        const maxX = minX + this.destSizeX - 1;
        const maxY = minY + this.destSizeY - 1;
        const srcMaxX = tileX + s - 1;
        const srcMaxY = tileY + s - 1;

        // OSRS: You cannot interact with an object if your footprint overlaps it
        if (footprintOverlaps(tileX, tileY, s, minX, minY, maxX, maxY)) {
            return this.allowOverlap;
        }

        // Which side of the target is the mover footprint flush against?
        // (rsmod reachRectangleN: the rects must touch with axis overlap.)
        const yOverlap = tileY <= maxY && srcMaxY >= minY;
        const xOverlap = tileX <= maxX && srcMaxX >= minX;
        const onWest = srcMaxX === minX - 1 && yOverlap;
        const onEast = tileX === maxX + 1 && yOverlap;
        const onSouth = srcMaxY === minY - 1 && xOverlap;
        const onNorth = tileY === maxY + 1 && xOverlap;

        if (!(onWest || onEast || onSouth || onNorth)) {
            // OSRS: You cannot interact with ANY object from a diagonal position.
            // Corner-only contact is allowed solely via the explicit opt-out.
            if (this.allowLargeDiagonal) {
                const xTouch = srcMaxX === minX - 1 || tileX === maxX + 1;
                const yTouch = srcMaxY === minY - 1 || tileY === maxY + 1;
                return xTouch && yTouch;
            }
            return false;
        }

        if (!this.collisionGetter) return true;

        // rsmod reachRectangleN: arrived if ANY tile along the shared edge is
        // not separated from the target by a wall.
        if (onWest || onEast) {
            const fromY = Math.max(tileY, minY);
            const toY = Math.min(srcMaxY, maxY);
            const px = onWest ? srcMaxX : tileX;
            const tx = onWest ? minX : maxX;
            for (let y = fromY; y <= toY; y++) {
                if (!isEdgeWallBlocked(this.collisionGetter, this.plane, px, y, tx, y, onWest ? "west" : "east")) {
                    return true;
                }
            }
            return false;
        }
        const fromX = Math.max(tileX, minX);
        const toX = Math.min(srcMaxX, maxX);
        const py = onSouth ? srcMaxY : tileY;
        const ty = onSouth ? minY : maxY;
        for (let x = fromX; x <= toX; x++) {
            if (!isEdgeWallBlocked(this.collisionGetter, this.plane, x, py, x, ty, onSouth ? "south" : "north")) {
                return true;
            }
        }
        return false;
    }
}

/**
 * Check if a wall blocks the shared edge between a mover edge tile and the
 * adjacent target edge tile. `side` is where the mover stands relative to the
 * target. Walls are flagged on both tiles of an edge, so either flag blocks.
 */
function isEdgeWallBlocked(
    getter: CollisionFlagGetter,
    plane: number,
    px: number,
    py: number,
    tx: number,
    ty: number,
    side: "west" | "east" | "south" | "north",
): boolean {
    const playerFlag = getter(px, py, plane) ?? 0;
    const targetFlag = getter(tx, ty, plane) ?? 0;
    switch (side) {
        case "west":
            return (playerFlag & WALL_EAST) !== 0 || (targetFlag & WALL_WEST) !== 0;
        case "east":
            return (playerFlag & WALL_WEST) !== 0 || (targetFlag & WALL_EAST) !== 0;
        case "south":
            return (playerFlag & WALL_NORTH) !== 0 || (targetFlag & WALL_SOUTH) !== 0;
        case "north":
            return (playerFlag & WALL_SOUTH) !== 0 || (targetFlag & WALL_NORTH) !== 0;
    }
}

// For walls, doors, or specific directional interactions.
// Also checks that no wall blocks the interaction edge.
export class CardinalAdjacentRouteStrategy extends RouteStrategy {
    private readonly rectX: number;
    private readonly rectY: number;
    private readonly sizeX: number;
    private readonly sizeY: number;
    private readonly allowOverlap: boolean;
    private readonly blockNorth: boolean;
    private readonly blockEast: boolean;
    private readonly blockSouth: boolean;
    private readonly blockWest: boolean;
    private collisionGetter?: CollisionFlagGetter;
    private plane: number = 0;

    constructor(
        rectX: number,
        rectY: number,
        sizeX: number,
        sizeY: number,
        allowOverlap: boolean = false,
        blockedSides?: CardinalBlockedSides,
    ) {
        super();
        this.rectX = rectX;
        this.rectY = rectY;
        this.sizeX = Math.max(1, sizeX);
        this.sizeY = Math.max(1, sizeY);
        this.allowOverlap = !!allowOverlap;
        this.blockNorth = !!blockedSides?.north;
        this.blockEast = !!blockedSides?.east;
        this.blockSouth = !!blockedSides?.south;
        this.blockWest = !!blockedSides?.west;

        // Client parity: SOUTH-WEST corner for alternative route search.
        this.approxDestX = this.rectX;
        this.approxDestY = this.rectY;
        this.destSizeX = this.sizeX;
        this.destSizeY = this.sizeY;
    }

    /**
     * Set a collision flag getter to enable wall checking.
     */
    setCollisionGetter(getter: CollisionFlagGetter, plane: number): void {
        this.collisionGetter = getter;
        this.plane = plane;
    }

    hasArrived(tileX: number, tileY: number, _level: number, size: number = 1): boolean {
        const s = Math.max(1, size | 0);
        const minX = this.rectX;
        const minY = this.rectY;
        const maxX = this.rectX + this.sizeX - 1;
        const maxY = this.rectY + this.sizeY - 1;
        const srcMaxX = tileX + s - 1;
        const srcMaxY = tileY + s - 1;

        if (footprintOverlaps(tileX, tileY, s, minX, minY, maxX, maxY)) {
            // rsmod reachWall: a size-N mover whose footprint contains the wall
            // tile has reached it; size-1 movers keep the explicit opt-in.
            return s > 1 ? true : this.allowOverlap;
        }

        // Flush side with axis overlap (footprint-based; no diagonal contact).
        const yOverlap = tileY <= maxY && srcMaxY >= minY;
        const xOverlap = tileX <= maxX && srcMaxX >= minX;
        const onWest = srcMaxX === minX - 1 && yOverlap;
        const onEast = tileX === maxX + 1 && yOverlap;
        const onSouth = srcMaxY === minY - 1 && xOverlap;
        const onNorth = tileY === maxY + 1 && xOverlap;

        if (!(onNorth || onSouth || onWest || onEast)) {
            return false;
        }
        if ((onNorth && this.blockNorth) || (onEast && this.blockEast)) {
            return false;
        }
        if ((onSouth && this.blockSouth) || (onWest && this.blockWest)) {
            return false;
        }

        if (!this.collisionGetter) return true;

        // Arrived if ANY tile along the shared edge is not separated by a wall.
        if (onWest || onEast) {
            const fromY = Math.max(tileY, minY);
            const toY = Math.min(srcMaxY, maxY);
            const px = onWest ? srcMaxX : tileX;
            const tx = onWest ? minX : maxX;
            for (let y = fromY; y <= toY; y++) {
                if (!isEdgeWallBlocked(this.collisionGetter, this.plane, px, y, tx, y, onWest ? "west" : "east")) {
                    return true;
                }
            }
            return false;
        }
        const fromX = Math.max(tileX, minX);
        const toX = Math.min(srcMaxX, maxX);
        const py = onSouth ? srcMaxY : tileY;
        const ty = onSouth ? minY : maxY;
        for (let x = fromX; x <= toX; x++) {
            if (!isEdgeWallBlocked(this.collisionGetter, this.plane, x, py, x, ty, onSouth ? "south" : "north")) {
                return true;
            }
        }
        return false;
    }
}

// Range checks (Mage/Range/Halberds).
export class RectWithinRangeRouteStrategy extends RouteStrategy {
    private readonly range: number;
    private readonly rectX: number;
    private readonly rectY: number;
    private readonly sizeX: number;
    private readonly sizeY: number;

    constructor(rectX: number, rectY: number, sizeX: number, sizeY: number, range: number) {
        super();
        this.rectX = rectX;
        this.rectY = rectY;
        this.sizeX = Math.max(1, sizeX);
        this.sizeY = Math.max(1, sizeY);
        this.range = Math.max(1, range);

        // Client parity: SOUTH-WEST corner and original target size (used for alternative route search).
        this.approxDestX = this.rectX;
        this.approxDestY = this.rectY;
        this.destSizeX = this.sizeX;
        this.destSizeY = this.sizeY;
    }

    hasArrived(tileX: number, tileY: number, _level: number, size: number = 1): boolean {
        const s = Math.max(1, size | 0);
        const minX = this.rectX;
        const minY = this.rectY;
        const maxX = this.rectX + this.sizeX - 1;
        const maxY = this.rectY + this.sizeY - 1;
        const srcMaxX = tileX + s - 1;
        const srcMaxY = tileY + s - 1;

        // OSRS logic: Usually you cannot attack if you are standing underneath the NPC.
        // For size-N movers this means any footprint overlap.
        if (footprintOverlaps(tileX, tileY, s, minX, minY, maxX, maxY)) {
            return false;
        }

        // Chebyshev distance between the mover footprint and the target rect
        // (OSRS range checks are square-radius, rect-to-rect for size-N movers).
        const dx = tileX > maxX ? tileX - maxX : minX > srcMaxX ? minX - srcMaxX : 0;
        const dy = tileY > maxY ? tileY - maxY : minY > srcMaxY ? minY - srcMaxY : 0;
        return Math.max(dx, dy) <= this.range;
    }
}

export class RectWithinRangeLineOfSightRouteStrategy extends RouteStrategy {
    private readonly range: number;
    private readonly rectX: number;
    private readonly rectY: number;
    private readonly sizeX: number;
    private readonly sizeY: number;
    private projectileRaycast?: ProjectileRaycastGetter;

    constructor(rectX: number, rectY: number, sizeX: number, sizeY: number, range: number) {
        super();
        this.rectX = rectX;
        this.rectY = rectY;
        this.sizeX = Math.max(1, sizeX);
        this.sizeY = Math.max(1, sizeY);
        this.range = Math.max(1, range);

        this.approxDestX = this.rectX;
        this.approxDestY = this.rectY;
        this.destSizeX = this.sizeX;
        this.destSizeY = this.sizeY;
    }

    setProjectileRaycast(getter: ProjectileRaycastGetter): void {
        this.projectileRaycast = getter;
    }

    hasArrived(tileX: number, tileY: number, level: number, size: number = 1): boolean {
        const s = Math.max(1, size | 0);
        const minX = this.rectX;
        const minY = this.rectY;
        const maxX = this.rectX + this.sizeX - 1;
        const maxY = this.rectY + this.sizeY - 1;
        const srcMaxX = tileX + s - 1;
        const srcMaxY = tileY + s - 1;

        if (footprintOverlaps(tileX, tileY, s, minX, minY, maxX, maxY)) {
            return false;
        }

        // Rect-to-rect Chebyshev distance (see RectWithinRangeRouteStrategy).
        const dx = tileX > maxX ? tileX - maxX : minX > srcMaxX ? minX - srcMaxX : 0;
        const dy = tileY > maxY ? tileY - maxY : minY > srcMaxY ? minY - srcMaxY : 0;
        if (Math.max(dx, dy) > this.range) {
            return false;
        }

        if (!this.projectileRaycast) {
            return false;
        }

        // OSRS LoS (rsmod LineValidator.hasLineOfSight): a single ray from the
        // source-footprint tile nearest the target to the target-rect tile
        // nearest the source, clamped per axis.
        const fromX = losCoordinate(tileX, this.rectX, s);
        const fromY = losCoordinate(tileY, this.rectY, s);
        const toX = losCoordinate(this.rectX, tileX, this.sizeX);
        const toY = losCoordinate(this.rectY, tileY, this.sizeY);
        return this.projectileRaycast(
            { x: fromX, y: fromY, plane: level },
            { x: toX, y: toY },
        ).clear;
    }
}

/**
 * rsmod LineValidator.coordinate: pick the edge tile of an entity (SW corner
 * `a`, given size) facing the other entity's SW corner `b` on one axis.
 */
function losCoordinate(a: number, b: number, size: number): number {
    if (a >= b) return a;
    if (a + size - 1 <= b) return a + size - 1;
    return b;
}
