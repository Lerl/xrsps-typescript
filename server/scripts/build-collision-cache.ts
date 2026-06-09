// tsx server/scripts/build-collision-cache.ts --include-models
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import { performance } from "perf_hooks";

import { initCacheEnv } from "../src/world/CacheEnv";
import { MapCollisionService } from "../src/world/MapCollisionService";

const MAX_MAP_X = 100; // Matches MapManager.MAX_MAP_X
const MAX_MAP_Y = 200; // Matches MapManager.MAX_MAP_Y
const LOG_INTERVAL_MS = 5_000;
const LOG_INTERVAL_STEPS = 25;
const GC_INTERVAL_STEPS = 32;

interface CliOptions {
    cacheName?: string;
    outDir?: string;
    includeModels: boolean;
    force: boolean;
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        includeModels: false,
        force: false,
    };
    for (const arg of argv) {
        if (arg.startsWith("--cache=")) {
            opts.cacheName = arg.slice("--cache=".length);
        } else if (arg.startsWith("--out=")) {
            opts.outDir = arg.slice("--out=".length);
        } else if (arg === "--include-models") {
            opts.includeModels = true;
        } else if (arg === "--force") {
            opts.force = true;
        } else if (!opts.cacheName) {
            opts.cacheName = arg;
        } else if (!opts.outDir) {
            opts.outDir = arg;
        }
    }
    return opts;
}

async function ensureDir(dir: string): Promise<void> {
    await fsp.mkdir(dir, { recursive: true });
}

/**
 * Best-effort GC hint. Only triggers when Node was started with
 * --expose-gc, otherwise it's a no-op. We don't force-enable it because
 * exposing the gc global changes the runtime contract.
 */
function maybeGc(processed: number): void {
    if (processed % GC_INTERVAL_STEPS !== 0) return;
    const g = (globalThis as { gc?: () => void }).gc;
    if (typeof g === "function") {
        try {
            g();
        } catch {
            /* ignore */
        }
    }
}

async function fileExists(file: string): Promise<boolean> {
    try {
        await fsp.access(file, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function main(): Promise<void> {
    const opts = parseArgs(process.argv.slice(2));
    const { cacheName, includeModels, force } = opts;
    const env = initCacheEnv("caches", cacheName);
    const defaultOut = path.resolve("server/cache/collision");
    const outRoot = path.resolve(opts.outDir ?? defaultOut);
    await ensureDir(outRoot);

    const mapService = new MapCollisionService(env, includeModels, {
        usePrecomputed: false,
    });

    const start = performance.now();
    let lastLog = start;
    let built = 0;
    let skippedMissing = 0;
    let skippedExisting = 0;

    let totalCandidates = 0;
    for (let mapX = 0; mapX < MAX_MAP_X; mapX++) {
        for (let mapY = 0; mapY < MAX_MAP_Y; mapY++) {
            if (env.mapFileIndex.getTerrainArchiveId(mapX, mapY) !== -1) totalCandidates++;
        }
    }
    console.log(
        `collision cache build starting: totalCandidates=${totalCandidates}, output="${outRoot}",` +
            ` includeModels=${includeModels}`,
    );

    const progress = () => {
        const now = performance.now();
        const processed = built + skippedExisting + skippedMissing;
        if (processed === 0) return;
        if (
            processed % LOG_INTERVAL_STEPS !== 0 &&
            now - lastLog < LOG_INTERVAL_MS &&
            processed !== totalCandidates
        ) {
            return;
        }
        lastLog = now;
        const elapsedMs = now - start;
        const avgMs = elapsedMs / processed;
        const remaining = Math.max(0, totalCandidates - processed);
        const etaMs = avgMs * remaining;
        const pct = ((processed / Math.max(1, totalCandidates)) * 100).toFixed(1);
        const format = (ms: number) => {
            if (!Number.isFinite(ms)) return "--";
            if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
            if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
            return `${ms.toFixed(0)}ms`;
        };
        console.log(
            `progress ${processed}/${totalCandidates} (${pct}%) built=${built}` +
                ` skippedExisting=${skippedExisting} skippedMissing=${skippedMissing}` +
                ` elapsed=${format(elapsedMs)} eta=${format(etaMs)}`,
        );
    };

    for (let mapX = 0; mapX < MAX_MAP_X; mapX++) {
        for (let mapY = 0; mapY < MAX_MAP_Y; mapY++) {
            const terrainArchive = env.mapFileIndex.getTerrainArchiveId(mapX, mapY);
            if (terrainArchive === -1) {
                continue;
            }
            const outFile = path.join(outRoot, `${mapX}_${mapY}.bin`);
            if (!force && (await fileExists(outFile))) {
                skippedExisting++;
                progress();
                continue;
            }
            // buildCollisionBuffer builds the scene and encodes it without
            // retaining the ServerMapSquare in the service cache. This keeps
            // heap usage bounded to ~1 square at a time instead of accumulating
            // every square built so far.
            const buffer = mapService.buildCollisionBuffer(mapX, mapY);
            if (!buffer) {
                skippedMissing++;
                progress();
                continue;
            }
            await fsp.writeFile(
                outFile,
                new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
            );
            built++;
            // After writing, the only remaining reference to the underlying
            // typed arrays is gone. Hint V8 to reclaim memory before the next
            // square. global.gc is only present when Node is started with
            // --expose-gc, so the typeof check makes this safe to omit.
            maybeGc(built + skippedExisting + skippedMissing);
            progress();
        }
    }

    const elapsed = performance.now() - start;
    console.log(
        `collision cache build complete: built=${built},` +
            ` skippedExisting=${skippedExisting}, skippedMissing=${skippedMissing},` +
            ` time=${elapsed.toFixed(0)}ms, output="${outRoot}"`,
    );
}

main().catch((err) => {
    console.error("build-collision-cache failed", err);
    process.exitCode = 1;
});
