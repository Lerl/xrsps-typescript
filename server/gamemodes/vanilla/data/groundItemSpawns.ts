import type { GamemodeServerServices } from "../../../src/game/gamemodes/GamemodeDefinition";
import rawGroundItemSpawns from "./groundItemSpawnData.json";

const DEFAULT_STATIC_GROUND_ITEM_RESPAWN_TICKS = 100;

interface GroundItemSpawnRow {
    id: number;
    count: number;
    x: number;
    y: number;
    plane: number;
    respawnTicks?: number;
}

function toInt(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.trunc(value);
}

function parseGroundItemSpawnRow(raw: unknown): GroundItemSpawnRow | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const record = raw as Record<string, unknown>;
    const id = toInt(record.id);
    const count = toInt(record.count);
    const x = toInt(record.x);
    const y = toInt(record.y);
    const plane = toInt(record.plane);
    const respawnTicks = toInt(record.respawnTicks);

    if (
        id === undefined ||
        count === undefined ||
        x === undefined ||
        y === undefined ||
        plane === undefined ||
        id <= 0 ||
        count <= 0
    ) {
        return undefined;
    }

    return {
        id,
        count,
        x,
        y,
        plane,
        respawnTicks: respawnTicks !== undefined && respawnTicks > 0 ? respawnTicks : undefined,
    };
}

export function registerVanillaGroundItemSpawns(services: GamemodeServerServices): void {
    const rows = Array.isArray(rawGroundItemSpawns) ? rawGroundItemSpawns : [];
    let registered = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = parseGroundItemSpawnRow(rows[i]);
        if (!row || !services.getObjType(row.id)) {
            skipped++;
            continue;
        }

        services.registerStaticGroundItem({
            key: `vanilla:${i}:${row.id}:${row.x}:${row.y}:${row.plane}`,
            itemId: row.id,
            quantity: row.count,
            tile: { x: row.x, y: row.y, level: row.plane },
            respawnTicks: row.respawnTicks ?? DEFAULT_STATIC_GROUND_ITEM_RESPAWN_TICKS,
        });
        registered++;
    }

    services.logger.info(
        `[ground-items] Registered ${registered} vanilla static ground item spawn(s)` +
            (skipped > 0 ? `, skipped ${skipped}` : ""),
    );
}
