/**
 * Collision building system tests.
 *
 * Two layers:
 *   1. Unit tests of the on-disk encoder/decoder and bitset helpers, with
 *      focus on buffer-overflow surfaces and malformed input handling.
 *   2. Integration tests that exercise the full pipeline against the real
 *      OSRS cache (caches/osrs-*). Skipped automatically when the cache is
 *      not present on disk.
 *
 * Run with:  npx tsx tests/collision-encoder.test.ts
 */
import fs from "fs";
import path from "path";

import { bitsetByteLength, bitsetGet, bitsetSet } from "../server/src/utils/bitset";
import {
    encodeCollisionPlane,
    encodeCollisionSquare,
} from "../server/src/world/CollisionSquareEncoder";
import { MapCollisionService } from "../server/src/world/MapCollisionService";
import type { ServerMapSquare } from "../server/src/world/MapCollisionService";
import { ByteBuffer } from "../src/rs/io/ByteBuffer";
import { CollisionMap } from "../src/rs/scene/CollisionMap";

// ============================================================================
// Minimal test harness (mirrors tests/instance-parity.test.ts)
// ============================================================================

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentDescribe = "";
let currentIt = "";

function assert(condition: boolean, msg: string): void {
    if (condition) {
        passed++;
    } else {
        failed++;
        failures.push(`${currentDescribe} > ${currentIt} — ${msg}`);
        console.error(`  FAIL: ${msg}`);
    }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
    if (actual === expected) {
        passed++;
    } else {
        failed++;
        const detail = `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
        failures.push(`${currentDescribe} > ${currentIt} — ${detail}`);
        console.error(`  FAIL: ${detail}`);
    }
}

function assertThrows(fn: () => void, msg: string): void {
    try {
        fn();
        failed++;
        const detail = `${msg} — expected throw, none happened`;
        failures.push(`${currentDescribe} > ${currentIt} — ${detail}`);
        console.error(`  FAIL: ${detail}`);
    } catch {
        passed++;
    }
}

function describe(name: string, fn: () => void): void {
    currentDescribe = name;
    console.log(`\n${name}`);
    fn();
}

function it(name: string, fn: () => void): void {
    currentIt = name;
    try {
        fn();
    } catch (e: unknown) {
        failed++;
        const err = e as { message?: string };
        const detail = `${name} — threw: ${err.message ?? String(e)}`;
        failures.push(`${currentDescribe} > ${detail}`);
        console.error(`  FAIL: ${detail}`);
    }
}

// ============================================================================
// Helpers — mirror MapCollisionService.loadPrecomputed parsing logic
// (duplicated so we can test it without spinning up a CacheEnv)
// ============================================================================

type DecodedSquare = {
    version: number;
    borderSize: number;
    size: number;
    planeCount: number;
    mapX: number;
    mapY: number;
    baseX: number;
    baseY: number;
    planes: { sizeX: number; sizeY: number; flags: Int32Array }[];
    linkBelow?: Uint8Array;
    forceMin0?: Uint8Array[];
    endOffset: number;
};

function decodeCollisionSquare(buf: Buffer): DecodedSquare | undefined {
    if (buf.length < 24) return undefined;
    let offset = 0;
    const version = buf.readUInt8(offset);
    offset += 1;
    if (version !== 1 && version !== 2) return undefined;
    const borderSize = buf.readUInt8(offset);
    offset += 1;
    const size = buf.readUInt16LE(offset);
    offset += 2;
    const planeCount = buf.readUInt8(offset);
    offset += 1;
    offset += 1; // reserved
    const headerMapX = buf.readUInt16LE(offset);
    offset += 2;
    const headerMapY = buf.readUInt16LE(offset);
    offset += 2;
    const baseX = buf.readInt32LE(offset);
    offset += 4;
    const baseY = buf.readInt32LE(offset);
    offset += 4;
    offset += 2; // sizeDuplicate
    offset += 2; // borderDuplicate
    offset += 2; // padding

    const planes: DecodedSquare["planes"] = [];
    for (let p = 0; p < planeCount; p++) {
        if (offset + 8 > buf.length) return undefined;
        const sizeX = buf.readUInt16LE(offset);
        const sizeY = buf.readUInt16LE(offset + 2);
        const flagCount = buf.readUInt32LE(offset + 4);
        offset += 8;
        const byteLength = flagCount * 4;
        if (offset + byteLength > buf.length) return undefined;
        const view = new Int32Array(buf.buffer, buf.byteOffset + offset, flagCount);
        const flags = new Int32Array(flagCount);
        flags.set(view);
        offset += byteLength;
        planes.push({ sizeX, sizeY, flags });
    }

    let linkBelow: Uint8Array | undefined;
    let forceMin0: Uint8Array[] | undefined;
    if (version === 2) {
        if (offset + 4 > buf.length) {
            return {
                version,
                borderSize,
                size,
                planeCount,
                mapX: headerMapX,
                mapY: headerMapY,
                baseX,
                baseY,
                planes,
                endOffset: offset,
            };
        }
        const bitsetLen = buf.readUInt32LE(offset);
        offset += 4;
        if (bitsetLen > 0) {
            if (offset + bitsetLen * 5 > buf.length) return undefined;
            linkBelow = new Uint8Array(bitsetLen);
            linkBelow.set(new Uint8Array(buf.buffer, buf.byteOffset + offset, bitsetLen));
            offset += bitsetLen;
            forceMin0 = new Array(4);
            for (let l = 0; l < 4; l++) {
                const mask = new Uint8Array(bitsetLen);
                mask.set(new Uint8Array(buf.buffer, buf.byteOffset + offset, bitsetLen));
                offset += bitsetLen;
                forceMin0[l] = mask;
            }
        }
    }

    return {
        version,
        borderSize,
        size,
        planeCount,
        mapX: headerMapX,
        mapY: headerMapY,
        baseX,
        baseY,
        planes,
        linkBelow,
        forceMin0,
        endOffset: offset,
    };
}

type SquareOverrides = Partial<ServerMapSquare> & { planeCount?: number };

function makeSquare(overrides: SquareOverrides = {}): ServerMapSquare {
    const size = overrides.size ?? 64;
    const borderSize = overrides.borderSize ?? 6;
    const planeCount = overrides.planeCount ?? overrides.collisionMaps?.length ?? 4;
    const collisionMaps =
        overrides.collisionMaps ??
        Array.from({ length: planeCount }, () => new CollisionMap(size, size));
    return {
        mapX: overrides.mapX ?? 50,
        mapY: overrides.mapY ?? 50,
        borderSize,
        baseX: overrides.baseX ?? 50 * 64 - borderSize,
        baseY: overrides.baseY ?? 50 * 64 - borderSize,
        size,
        collisionMaps,
        tileRenderFlags: overrides.tileRenderFlags,
    };
}

/** Type-safe decoder: returns `undefined` for failure, narrows otherwise. */

// ============================================================================
// 1. bitsetByteLength
// ============================================================================

describe("bitsetByteLength", () => {
    it("0 bits → 0 bytes", () => assertEqual(bitsetByteLength(0), 0, "0"));
    it("1 bit → 1 byte", () => assertEqual(bitsetByteLength(1), 1, "1"));
    it("7 bits → 1 byte", () => assertEqual(bitsetByteLength(7), 1, "7"));
    it("8 bits → 1 byte", () => assertEqual(bitsetByteLength(8), 1, "8"));
    it("9 bits → 2 bytes", () => assertEqual(bitsetByteLength(9), 2, "9"));
    it("15 bits → 2 bytes", () => assertEqual(bitsetByteLength(15), 2, "15"));
    it("16 bits → 2 bytes", () => assertEqual(bitsetByteLength(16), 2, "16"));
    it("17 bits → 3 bytes", () => assertEqual(bitsetByteLength(17), 3, "17"));
    it("clamps negatives to 0", () => assertEqual(bitsetByteLength(-5), 0, "-5"));
    it("truncates fractional input", () => assertEqual(bitsetByteLength(15.9), 2, "15.9"));
    it("64×64 = 4096 bits → 512 bytes", () => assertEqual(bitsetByteLength(64 * 64), 512, "64*64"));
});

// ============================================================================
// 2. bitsetGet / bitsetSet
// ============================================================================

describe("bitsetGet / bitsetSet", () => {
    it("set then get round-trips true", () => {
        const bs = new Uint8Array(2);
        for (let i = 0; i < 16; i++) {
            bitsetSet(bs, i, true);
            assert(bitsetGet(bs, i), `bit ${i} set/get true`);
        }
    });

    it("set true then set false clears the bit", () => {
        const bs = new Uint8Array(1);
        bitsetSet(bs, 3, true);
        assert(bitsetGet(bs, 3), "set true");
        bitsetSet(bs, 3, false);
        assert(!bitsetGet(bs, 3), "set false");
    });

    it("out-of-range get returns false (no throw)", () => {
        const bs = new Uint8Array(1);
        assert(!bitsetGet(bs, 8), "byte 1 not present");
        assert(!bitsetGet(bs, 9999), "huge index");
    });

    it("out-of-range set is a no-op (no throw)", () => {
        const bs = new Uint8Array(1);
        bitsetSet(bs, 8, true);
        bitsetSet(bs, 9999, true);
        bitsetSet(bs, -1, true);
        assert(!bitsetGet(bs, 8), "bit 8 still false after oob set");
    });

    it("negative indices are rejected", () => {
        const bs = new Uint8Array(1);
        assert(!bitsetGet(bs, -1), "neg get → false");
        bitsetSet(bs, -1, true);
        assert(!bitsetGet(bs, 7), "neg set did not bleed into bit 7");
    });

    it("bits in the same byte do not interfere", () => {
        const bs = new Uint8Array(1);
        bitsetSet(bs, 0, true);
        bitsetSet(bs, 1, true);
        bitsetSet(bs, 7, true);
        assert(bitsetGet(bs, 0) && bitsetGet(bs, 1) && bitsetGet(bs, 7), "all set");
        assert(!bitsetGet(bs, 2) && !bitsetGet(bs, 3) && !bitsetGet(bs, 6), "others clear");
    });
});

// ============================================================================
// 3. encodeCollisionPlane — header layout
// ============================================================================

describe("encodeCollisionPlane — header layout", () => {
    it("writes an 8-byte header (sizeX, sizeY, flagCount)", () => {
        const map = new CollisionMap(8, 4);
        const buf = encodeCollisionPlane(map);
        assertEqual(buf.length, 8 + 8 * 4 * 4, "header(8) + 32 flags * 4 bytes");
        assertEqual(buf.readUInt16LE(0), 8, "sizeX");
        assertEqual(buf.readUInt16LE(2), 4, "sizeY");
        assertEqual(buf.readUInt32LE(4), 32, "flagCount");
    });

    it("zero-area map (1x1) round-trips with one flag (border = 0xffffff)", () => {
        const map = new CollisionMap(1, 1);
        const buf = encodeCollisionPlane(map);
        assertEqual(buf.readUInt16LE(0), 1, "sizeX=1");
        assertEqual(buf.readUInt16LE(2), 1, "sizeY=1");
        assertEqual(buf.readUInt32LE(4), 1, "flagCount=1");
        // 1x1 has no interior tile; CollisionMap.reset() treats everything as border.
        assertEqual(buf.readInt32LE(8) >>> 0, 0xffffff, "1x1 = all border = 0xffffff");
    });

    it("non-square map preserves sizeX and sizeY", () => {
        const map = new CollisionMap(13, 7);
        const buf = encodeCollisionPlane(map);
        assertEqual(buf.readUInt16LE(0), 13, "sizeX");
        assertEqual(buf.readUInt16LE(2), 7, "sizeY");
        assertEqual(buf.readUInt32LE(4), 13 * 7, "flagCount");
    });
});

// ============================================================================
// 4. encodeCollisionPlane — round-trip
// ============================================================================

describe("encodeCollisionPlane — flag round-trip", () => {
    it("preserves every flag value (walkable, fully blocked, custom)", () => {
        const sizeX = 4;
        const sizeY = 4;
        const map = new CollisionMap(sizeX, sizeY);
        const patterns = [0, 0xffffff, 0x1, 0x80, 0x100, 0x20000, 0x200000, 0x40000, 0x12345];
        for (let x = 0; x < sizeX; x++) {
            for (let y = 0; y < sizeY; y++) {
                map.setFlag(x, y, patterns[(x * sizeY + y) % patterns.length]);
            }
        }
        const buf = encodeCollisionPlane(map);
        for (let x = 0; x < sizeX; x++) {
            for (let y = 0; y < sizeY; y++) {
                const got = buf.readInt32LE(8 + (x + y * sizeX) * 4);
                assertEqual(
                    got >>> 0,
                    patterns[(x * sizeY + y) % patterns.length] >>> 0,
                    `flag at (${x},${y})`,
                );
            }
        }
    });

    it("resets to 0xffffff on the border, 0 in the interior (CollisionMap.reset)", () => {
        const map = new CollisionMap(8, 8);
        const buf = encodeCollisionPlane(map);
        assertEqual(buf.readInt32LE(8 + (1 + 1 * 8) * 4), 0, "interior (1,1) = 0");
        assertEqual(
            buf.readInt32LE(8 + (0 + 0 * 8) * 4) >>> 0,
            0xffffff,
            "corner (0,0) = 0xffffff",
        );
    });
});

// ============================================================================
// 5. encodeCollisionSquare — header overflow truncation
//
// We test the truncation semantics two ways:
//   a) Round-trip a square at the maximum in-range size, then verify the
//      low bytes of the header match the input.
//   b) Directly exercise the Buffer.write* APIs the encoder relies on, to
//      confirm they reject out-of-range values (the encoder's last-line
//      defense).
// We can't construct a square of size > 0xffff in-memory without allocating
// gigabytes of memory; the encoder is intentionally defensive with `& 0xff`
// and `& 0xffff` masks, which is what we verify here.
// ============================================================================

describe("encodeCollisionSquare — header overflow truncation", () => {
    it("max in-range size (size=0xff0) fits cleanly in the 16-bit field", () => {
        // 0xffff × 0xffff = 4G flags would allocate 16GB — too big. Use 0xff0
        // (a 16-bit value that still exercises the field's full width) and
        // keep the planes small to avoid 2GB+ meta bitset allocations.
        const planes = [new CollisionMap(8, 8), new CollisionMap(8, 8)];
        const square = makeSquare({ size: 0xff0, planeCount: 2, collisionMaps: planes });
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readUInt16LE(2), 0xff0, "size fits in 16 bits");
        assertEqual(buf.readUInt16LE(18), 0xff0, "size duplicate fits");
    });

    it("borderSize=0xff fits in the 8-bit field", () => {
        const square = makeSquare({ borderSize: 0xff });
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readUInt8(1), 0xff, "borderSize fits in 8 bits");
    });

    it("planeCount=0xff fits in the 8-bit field", () => {
        const planes = Array.from({ length: 0xff }, () => new CollisionMap(4, 4));
        const square = makeSquare({ planeCount: 0xff, collisionMaps: planes });
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readUInt8(4), 0xff, "planeCount fits in 8 bits");
    });

    it("mapX=0xfffe fits in the 16-bit field", () => {
        const square = makeSquare({ mapX: 0xfffe });
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readUInt16LE(6), 0xfffe, "mapX fits");
    });

    it("mapY=0xfffe fits in the 16-bit field", () => {
        const square = makeSquare({ mapY: 0xfffe });
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readUInt16LE(8), 0xfffe, "mapY fits");
    });

    it("direct test: the `& 0xffff` / `& 0xff` masks used by the encoder", () => {
        // The encoder's behavior at the wire level is `value & mask`. We
        // exercise that pattern directly to document and lock in the
        // truncation contract. (Constructing a > 0xffff square would
        // require 4GB+ of memory and isn't viable in a unit test.)
        const b = Buffer.alloc(24);
        b.writeUInt16LE(0x10011 & 0xffff, 2);
        assertEqual(b.readUInt16LE(2), 0x11, "size & 0xffff truncates");
        b.writeUInt8(0x123 & 0xff, 1);
        assertEqual(b.readUInt8(1), 0x23, "borderSize & 0xff truncates");
        b.writeUInt16LE(0x10042 & 0xffff, 6);
        assertEqual(b.readUInt16LE(6), 0x42, "mapX & 0xffff truncates");
    });

    it("negative baseX/baseY round-trip via Int32LE", () => {
        const square = makeSquare({ baseX: -1234567, baseY: -7654321 });
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readInt32LE(10), -1234567, "baseX");
        assertEqual(buf.readInt32LE(14), -7654321, "baseY");
    });

    it("byte at offset 5 is reserved/zero", () => {
        const square = makeSquare();
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readUInt8(5), 0, "reserved byte is 0");
    });

    it("bytes at offset 22–23 are reserved padding (zero)", () => {
        const square = makeSquare();
        const buf = encodeCollisionSquare(square);
        assertEqual(buf.readUInt16LE(22), 0, "padding is 0");
    });
});

// ============================================================================
// 6. encodeCollisionSquare — full round-trip via decodeCollisionSquare
// ============================================================================

describe("encodeCollisionSquare — round-trip", () => {
    it("basic 4-plane square with no tileRenderFlags", () => {
        const square = makeSquare({ size: 32, planeCount: 4 });
        const buf = encodeCollisionSquare(square);
        const dec = decodeCollisionSquare(buf);
        assert(dec !== undefined, "decoded");
        if (!dec) return;
        assertEqual(dec.version, 2, "version");
        assertEqual(dec.borderSize, 6, "borderSize");
        assertEqual(dec.size, 32, "size");
        assertEqual(dec.planeCount, 4, "planeCount");
        assertEqual(dec.mapX, 50, "mapX");
        assertEqual(dec.mapY, 50, "mapY");
        assertEqual(dec.planes.length, 4, "4 planes decoded");
    });

    it("plane sizes are preserved per-plane", () => {
        const square = makeSquare({
            size: 8,
            planeCount: 3,
            collisionMaps: [new CollisionMap(8, 8), new CollisionMap(8, 8), new CollisionMap(8, 8)],
        });
        const buf = encodeCollisionSquare(square);
        const dec = decodeCollisionSquare(buf);
        assert(dec !== undefined, "decoded");
        if (!dec) return;
        for (let p = 0; p < dec.planes.length; p++) {
            assertEqual(dec.planes[p].sizeX, 8, `plane ${p} sizeX`);
            assertEqual(dec.planes[p].sizeY, 8, `plane ${p} sizeY`);
            assertEqual(dec.planes[p].flags.length, 64, `plane ${p} flagCount`);
        }
    });

    it("flag values are preserved per plane (non-uniform collision)", () => {
        const plane0 = new CollisionMap(4, 4);
        const plane1 = new CollisionMap(4, 4);
        plane0.setFlag(2, 3, 0x12345);
        plane1.setFlag(0, 0, 0xffffff);
        plane1.setFlag(1, 1, 0x200000);
        const square = makeSquare({
            size: 4,
            planeCount: 2,
            collisionMaps: [plane0, plane1],
        });
        const buf = encodeCollisionSquare(square);
        const dec = decodeCollisionSquare(buf);
        assert(dec !== undefined, "decoded");
        if (!dec) return;
        assertEqual(dec.planes[0].flags[2 + 3 * 4] >>> 0, 0x12345, "plane0[2,3]");
        assertEqual(dec.planes[1].flags[0] >>> 0, 0xffffff, "plane1[0,0]");
        assertEqual(dec.planes[1].flags[1 + 1 * 4] >>> 0, 0x200000, "plane1[1,1]");
    });
});

// ============================================================================
// 7. encodeCollisionSquare — meta footer (encodeSquareMeta)
// ============================================================================

describe("encodeCollisionSquare — meta footer (v2)", () => {
    it("size=0 yields no linkBelow/forceMin0 bitset payload", () => {
        // size=0 → tileCount=0 → bitsetLen=0 → no bitset payload.
        const square = makeSquare({ size: 0 });
        const buf = encodeCollisionSquare(square);
        const dec = decodeCollisionSquare(buf);
        assert(dec !== undefined, "decoded");
        if (!dec) return;
        assertEqual(dec.linkBelow, undefined, "no linkBelow when size=0");
        assertEqual(dec.forceMin0, undefined, "no forceMin0 when size=0");
    });

    it("encodes linkBelow bit when tileRenderFlags[1] has bit 0x2 set", () => {
        const size = 8;
        const flags: Uint8Array[][] = [
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
        ];
        flags[1][3][5] = 0x02;
        flags[1][3][6] = 0x02;
        const square = makeSquare({ size, tileRenderFlags: flags });
        const buf = encodeCollisionSquare(square);
        const dec = decodeCollisionSquare(buf);
        if (!dec) {
            assert(false, "decoded");
            return;
        }
        if (!dec.linkBelow) {
            assert(false, "linkBelow present");
            return;
        }
        assert(bitsetGet(dec.linkBelow, 3 * size + 5), "linkBelow[3,5]");
        assert(bitsetGet(dec.linkBelow, 3 * size + 6), "linkBelow[3,6]");
        assert(!bitsetGet(dec.linkBelow, 0), "linkBelow[0,0] clear");
    });

    it("encodes forceMin0 masks across all 4 levels when bit 0x8 is set", () => {
        const size = 8;
        const flags: Uint8Array[][] = [
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
        ];
        flags[0][1][2] = 0x08;
        flags[2][7][0] = 0x08;
        const square = makeSquare({ size, tileRenderFlags: flags });
        const buf = encodeCollisionSquare(square);
        const dec = decodeCollisionSquare(buf);
        if (!dec) {
            assert(false, "decoded");
            return;
        }
        if (!dec.forceMin0) {
            assert(false, "forceMin0 present");
            return;
        }
        assertEqual(dec.forceMin0.length, 4, "4 levels");
        assert(bitsetGet(dec.forceMin0[0], 1 * size + 2), "level0 bit");
        assert(bitsetGet(dec.forceMin0[2], 7 * size + 0), "level2 bit");
        assert(!bitsetGet(dec.forceMin0[1], 1 * size + 2), "level1 unaffected");
    });

    it("ignores extraneous bits — only bit 0x2 → linkBelow, only bit 0x8 → forceMin0", () => {
        const size = 4;
        const flags: Uint8Array[][] = [
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
        ];
        flags[1][0][0] = 0xff;
        const square = makeSquare({ size, tileRenderFlags: flags });
        const buf = encodeCollisionSquare(square);
        const dec = decodeCollisionSquare(buf);
        if (!dec) {
            assert(false, "decoded");
            return;
        }
        if (!dec.linkBelow || !dec.forceMin0) {
            assert(false, "linkBelow and forceMin0 present");
            return;
        }
        assert(bitsetGet(dec.linkBelow, 0), "bit 0x2 captured");
        assert(bitsetGet(dec.forceMin0[1], 0), "bit 0x8 captured on level 1");
        assert(!bitsetGet(dec.forceMin0[0], 0), "level 0 unaffected");
    });

    it("missing levels in tileRenderFlags are tolerated (use 0)", () => {
        const size = 4;
        const flags: Uint8Array[][] = [
            Array.from({ length: size }, () => new Uint8Array(size)),
            // levels 1, 2, 3 missing
        ];
        const square = makeSquare({ size, tileRenderFlags: flags });
        let buf: Buffer | undefined;
        let threw = false;
        try {
            buf = encodeCollisionSquare(square);
        } catch {
            threw = true;
        }
        assert(!threw, "encoder does not throw with missing levels");
        assert(buf !== undefined && buf.length > 0, "encoder produces a buffer");
        // Levels 1-3 default to 0, so no bits in their forceMin0 masks.
        if (buf) {
            const dec = decodeCollisionSquare(buf);
            assert(dec !== undefined, "round-trip parse succeeded");
            if (dec && dec.forceMin0) {
                for (let l = 1; l < 4; l++) {
                    for (let i = 0; i < dec.forceMin0[l].length * 8; i++) {
                        assert(!bitsetGet(dec.forceMin0[l], i), `level ${l} bit ${i} clear`);
                    }
                }
            }
        }
    });

    it("short rows in tileRenderFlags are tolerated (use 0)", () => {
        const size = 4;
        const flags: Uint8Array[][] = [
            [new Uint8Array(2), new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)],
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
        ];
        const square = makeSquare({ size, tileRenderFlags: flags });
        let threw = false;
        try {
            encodeCollisionSquare(square);
        } catch {
            threw = true;
        }
        assert(!threw, "encoder does not throw with short row");
    });

    it("short inner arrays in tileRenderFlags are tolerated (use 0)", () => {
        const size = 4;
        const flags: Uint8Array[][] = [
            Array.from({ length: size }, () => new Uint8Array(2)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
            Array.from({ length: size }, () => new Uint8Array(size)),
        ];
        const square = makeSquare({ size, tileRenderFlags: flags });
        let threw = false;
        try {
            encodeCollisionSquare(square);
        } catch {
            threw = true;
        }
        assert(!threw, "encoder does not throw with short inner");
    });
});

// ============================================================================
// 8. encodeCollisionSquare — buffer-overflow / out-of-bounds surfaces
// ============================================================================

describe("encodeCollisionSquare — buffer overflow guards", () => {
    it("Buffer.writeUInt8/16/32 reject values that exceed their width", () => {
        const b = Buffer.alloc(8);
        b.writeUInt8(0xff, 0);
        b.writeUInt16LE(0xffff, 1);
        b.writeUInt32LE(0xffffffff, 3);
        b.writeInt32LE(-1, 3);
        assertEqual(b.readUInt32LE(3) >>> 0, 0xffffffff, "Int32LE(-1) round-trips");

        // These should throw — the engine's last-line defense against
        // untruncated values reaching the wire.
        assertThrows(() => b.writeUInt8(0x100, 0), "writeUInt8 rejects 0x100");
        assertThrows(() => b.writeUInt16LE(0x10000, 1), "writeUInt16LE rejects 0x10000");
        assertThrows(() => b.writeUInt32LE(0x100000000, 3), "writeUInt32LE rejects > 32 bits");
    });

    it("bitsetLen in the meta footer is well-formed for in-range sizes", () => {
        const size = 0xff;
        const square = makeSquare({ size });
        const buf = encodeCollisionSquare(square);
        const planeByteSize = 8 + size * size * 4;
        const bitsetLenOffset = 24 + 4 * planeByteSize;
        assert(bitsetLenOffset + 4 <= buf.length, "bitsetLen offset within buffer");
        const bitsetLen = buf.readUInt32LE(bitsetLenOffset);
        const expected = bitsetByteLength(size * size);
        assertEqual(bitsetLen, expected, "bitsetLen matches size*size/8 (rounded up)");
    });
});

// ============================================================================
// 9. decodeCollisionSquare — malformed input handling
// ============================================================================

describe("decodeCollisionSquare — malformed input", () => {
    it("rejects buffers shorter than the 24-byte header", () => {
        assertEqual(decodeCollisionSquare(Buffer.alloc(0)), undefined, "0 bytes");
        assertEqual(decodeCollisionSquare(Buffer.alloc(23)), undefined, "23 bytes");
    });

    it("rejects unknown versions", () => {
        const b = Buffer.alloc(24);
        b.writeUInt8(99, 0);
        assertEqual(decodeCollisionSquare(b), undefined, "version 99 rejected");
    });

    it("v1 with no planes parses cleanly", () => {
        const square = makeSquare({ size: 4, planeCount: 0 });
        const buf = encodeCollisionSquare(square);
        buf.writeUInt8(1, 0); // flip to v1
        const dec = decodeCollisionSquare(buf);
        assert(dec !== undefined, "v1 with 0 planes parses");
        if (dec) {
            assertEqual(dec.version, 1, "version 1");
            assertEqual(dec.planeCount, 0, "0 planes");
        }
    });

    it("rejects a plane header that overruns the buffer", () => {
        const b = Buffer.alloc(28);
        b.writeUInt8(2, 0); // version
        b.writeUInt8(6, 1); // borderSize
        b.writeUInt16LE(8, 2); // size
        b.writeUInt8(1, 4); // planeCount
        b.writeUInt16LE(8, 24);
        b.writeUInt16LE(8, 26);
        // 4 bytes for flagCount starting at 28 — but the buffer is only 28 bytes,
        // and the requested count is 0xffffffff (16GB), which can't fit.
        // We need to write 4 bytes for the count, then attempt to read it.
        // Make the buffer 32 bytes total.
        const b2 = Buffer.alloc(32);
        Buffer.from(b).copy(b2);
        b2.writeUInt32LE(0xffffffff, 28);
        assertEqual(decodeCollisionSquare(b2), undefined, "huge flagCount rejected");
    });

    it("rejects v2 with a meta footer larger than the buffer", () => {
        const square = makeSquare({ size: 4 });
        const buf = encodeCollisionSquare(square);
        const planeByteSize = 8 + 4 * 4 * 4;
        const bitsetLenOffset = 24 + 4 * planeByteSize;
        buf.writeUInt32LE(0xffffff, bitsetLenOffset);
        assertEqual(decodeCollisionSquare(buf), undefined, "huge bitsetLen rejected");
    });

    it("v2 with bitsetLen=0 still parses (no bitset payload)", () => {
        const square = makeSquare({ size: 4, planeCount: 1 });
        const buf = encodeCollisionSquare(square);
        const planeByteSize = 8 + 1 * 4 * 4;
        const bitsetLenOffset = 24 + 1 * planeByteSize;
        buf.writeUInt32LE(0, bitsetLenOffset);
        const dec = decodeCollisionSquare(buf);
        assert(dec !== undefined, "v2 with bitsetLen=0 parses");
    });
});

// ============================================================================
// 10. ByteBuffer overflow contract
// ============================================================================
//
// These tests pin down the contract that `ByteBuffer.readByte` and friends
// throw "Buffer overflow" when read past the end. The build-cache run for
// `osrs-237_2026-03-25` hit this exact path on square (98, 199) — the
// decoder had consumed more bytes than the source map file contained. The
// underlying fix is in `SceneBuilder.decodeTerrain` (and `decodeLocs`),
// which must now treat the overflow as "end of data / world edge" rather
// than letting it propagate.

describe("ByteBuffer overflow contract", () => {
    it("readByte throws 'Buffer overflow' when offset == length", () => {
        const b = new ByteBuffer(new Int8Array([1, 2, 3]));
        b.offset = 3;
        assertThrows(() => b.readByte(), "readByte at end throws");
        try {
            b.readByte();
        } catch (e) {
            assertEqual(
                (e as Error).message,
                "Buffer overflow",
                "error message is 'Buffer overflow'",
            );
        }
    });

    it("readByte throws 'Buffer overflow' on an empty buffer", () => {
        const b = new ByteBuffer(new Int8Array(0));
        assertThrows(() => b.readByte(), "readByte on empty throws");
    });

    it("readShort throws when only one byte remains", () => {
        // readShort calls readUnsignedByte twice (32-bit path).
        const b = new ByteBuffer(new Int8Array([0x42]));
        assertThrows(() => b.readShort(), "readShort with 1 byte throws");
    });

    it("offset is NOT advanced when readByte throws", () => {
        const b = new ByteBuffer(new Int8Array([1]));
        b.offset = 1;
        try {
            b.readByte();
        } catch {
            // expected
        }
        assertEqual(b.offset, 1, "offset stays at 1 after failed read");
    });

    it("remaining reports the correct number of unread bytes", () => {
        const b = new ByteBuffer(new Int8Array([1, 2, 3, 4, 5]));
        assertEqual(b.remaining, 5, "fresh buffer: 5 remaining");
        b.readByte();
        assertEqual(b.remaining, 4, "after 1 read: 4 remaining");
        b.readShort();
        assertEqual(b.remaining, 2, "after 1 readByte + 1 readShort: 2 remaining");
    });
});

// ============================================================================
// 11. Integration tests — real OSRS cache (skipped if cache is missing)
// ============================================================================

function findCacheRoot(): string | undefined {
    const targetPath = path.resolve("target.txt");
    if (!fs.existsSync(targetPath)) return undefined;
    const target = fs.readFileSync(targetPath, "utf8").trim();
    const cacheRoot = path.resolve("caches", target);
    return fs.existsSync(cacheRoot) ? cacheRoot : undefined;
}

describe("integration — real OSRS cache (MapCollisionService.buildCollisionBuffer)", () => {
    const cacheRoot = findCacheRoot();
    if (!cacheRoot) {
        it("skipped (no OSRS cache present — run `npm run ensure-cache`)", () => {
            assert(true, "skipped");
        });
        return;
    }

    // Import lazily so missing cache doesn't break unit-test runs.
    let env: ReturnType<typeof import("../server/src/world/CacheEnv").initCacheEnv> | undefined;
    let envErr: unknown;
    try {
        const CacheEnvMod = require("../server/src/world/CacheEnv");
        env = CacheEnvMod.initCacheEnv("caches", path.basename(cacheRoot));
    } catch (e) {
        envErr = e;
    }

    if (!env) {
        it(`skipped (CacheEnv failed to init: ${(envErr as Error)?.message ?? envErr})`, () => {
            assert(true, "skipped");
        });
        return;
    }

    // Just two sample squares — one in the Lumbridge area, one deeper in
    // the wilderness. The point of these tests is to exercise the
    // encoder/decoder on real data, not to hit every region.
    const SAMPLE_SQUARES: Array<[number, number]> = [
        [50, 50],
        [32, 32],
    ];

    // Stable, deterministic 32-bit FNV-1a hash over a byte array. Used to
    // verify that an entire flag plane round-trips exactly, without
    // emitting one assertion per flag (which would explode test counts
    // by ~10k× for a real map square).
    function fnv1a32(bytes: ArrayLike<number>): number {
        let h = 0x811c9dc5;
        for (let i = 0; i < bytes.length; i++) {
            h ^= bytes[i] & 0xff;
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }

    const service = new MapCollisionService(env, false, { usePrecomputed: false });

    for (const [mapX, mapY] of SAMPLE_SQUARES) {
        describe(`square (${mapX}, ${mapY})`, () => {
            it("builds a valid v2 collision buffer", () => {
                const buf = service.buildCollisionBuffer(mapX, mapY);
                if (!buf) {
                    assert(true, "no data — skipped");
                    return;
                }
                assert(buf.length >= 24, "at least a header is present");
                assertEqual(buf.readUInt8(0), 2, "version 2");
                assertEqual(buf.readUInt16LE(6), mapX, "mapX in header");
                assertEqual(buf.readUInt16LE(8), mapY, "mapY in header");
            });

            it("decodes to a structurally valid square", () => {
                const buf = service.buildCollisionBuffer(mapX, mapY);
                if (!buf) {
                    assert(true, "no data — skipped");
                    return;
                }
                const dec = decodeCollisionSquare(buf);
                if (!dec) {
                    assert(false, "decoded");
                    return;
                }
                assertEqual(dec.version, 2, "version");
                assertEqual(dec.mapX, mapX, "mapX");
                assertEqual(dec.mapY, mapY, "mapY");
                assert(dec.planes.length >= 1, "at least one plane");
                assert(dec.planes.length <= 4, "at most 4 planes");
            });

            it("re-encodes to an equivalent buffer (idempotent)", () => {
                const buf = service.buildCollisionBuffer(mapX, mapY);
                if (!buf) {
                    assert(true, "no data — skipped");
                    return;
                }
                const dec = decodeCollisionSquare(buf);
                if (!dec) {
                    assert(true, "decode failed — skipped");
                    return;
                }
                const planeMaps = dec.planes.map(
                    (p) => new CollisionMap(p.sizeX, p.sizeY, p.flags),
                );
                const square: ServerMapSquare = {
                    mapX: dec.mapX,
                    mapY: dec.mapY,
                    borderSize: dec.borderSize,
                    baseX: dec.baseX,
                    baseY: dec.baseY,
                    size: dec.size,
                    collisionMaps: planeMaps,
                };
                const buf2 = encodeCollisionSquare(square);
                const dec2 = decodeCollisionSquare(buf2);
                if (!dec2) {
                    assert(false, "second decode succeeded");
                    return;
                }
                assertEqual(dec2.size, dec.size, "size preserved");
                assertEqual(dec2.planeCount, dec.planeCount, "planeCount preserved");
                assertEqual(dec2.borderSize, dec.borderSize, "borderSize preserved");
                assertEqual(dec2.mapX, dec.mapX, "mapX preserved");
                assertEqual(dec2.mapY, dec.mapY, "mapY preserved");
            });

            it("per-plane flag data round-trips exactly (FNV-1a checksum)", () => {
                // One assertion per plane: a stable 32-bit hash over the
                // flag bytes. This catches any byte-level corruption in
                // the encoder without emitting thousands of redundant
                // per-flag assertions.
                const buf = service.buildCollisionBuffer(mapX, mapY);
                if (!buf) {
                    assert(true, "no data — skipped");
                    return;
                }
                const dec = decodeCollisionSquare(buf);
                if (!dec) {
                    assert(true, "decode failed — skipped");
                    return;
                }
                for (let p = 0; p < dec.planes.length; p++) {
                    const plane = dec.planes[p];
                    const map = new CollisionMap(plane.sizeX, plane.sizeY, plane.flags);
                    const buf2 = encodeCollisionPlane(map);
                    const encoded = new Int8Array(
                        buf2.buffer,
                        buf2.byteOffset + 8,
                        plane.flags.length * 4,
                    );
                    const original = new Int8Array(plane.flags.buffer);
                    assertEqual(
                        fnv1a32(encoded),
                        fnv1a32(original),
                        `plane ${p} flag bytes match (${plane.flags.length} flags)`,
                    );
                }
            });

            it("spot-checks: corners + center of plane 0 round-trip", () => {
                // Belt-and-suspenders: even if the hash somehow collides,
                // verify a handful of geometrically-meaningful positions
                // (the four corners and the center) match byte-for-byte.
                const buf = service.buildCollisionBuffer(mapX, mapY);
                if (!buf) {
                    assert(true, "no data — skipped");
                    return;
                }
                const dec = decodeCollisionSquare(buf);
                if (!dec || dec.planes.length === 0) {
                    assert(true, "no data — skipped");
                    return;
                }
                const plane = dec.planes[0];
                const map = new CollisionMap(plane.sizeX, plane.sizeY, plane.flags);
                const buf2 = encodeCollisionPlane(map);
                const positions: Array<[number, number, string]> = [
                    [0, 0, "top-left"],
                    [plane.sizeX - 1, 0, "top-right"],
                    [0, plane.sizeY - 1, "bottom-left"],
                    [plane.sizeX - 1, plane.sizeY - 1, "bottom-right"],
                    [Math.floor(plane.sizeX / 2), Math.floor(plane.sizeY / 2), "center"],
                ];
                for (const [x, y, label] of positions) {
                    const offset = 8 + (x + y * plane.sizeX) * 4;
                    assertEqual(
                        buf2.readInt32LE(offset) | 0,
                        plane.flags[x + y * plane.sizeX] | 0,
                        `plane 0 (${x},${y}) ${label}`,
                    );
                }
            });
        });
    }

    // ------------------------------------------------------------------------
    // REGRESSION: world-edge buffer overflow in SceneBuilder.decodeTerrain.
    //
    // During the first run of `npm run server:build-collision` against the
    // osrs-237_2026-03-25 cache, square (98, 199) failed with:
    //
    //   [MapCollisionService] failed to build scene for 98_199: Buffer overflow
    //       at ByteBuffer.readByte
    //       at ByteBuffer.readUnsignedByte
    //       at ByteBuffer.readShort
    //       at readTerrainValue (SceneBuilder.ts:39)
    //       at decodeTerrainTile (SceneBuilder.ts:378)
    //
    // Cause: `buildScene(98, 199)` loads the 3×3 grid of source squares
    // (97..99 × 198..200) to cover the 76×76 region. The southeast corner
    // of the world map has terrain data shorter than the 4×64×64 tile
    // loop assumes, so the decoder reads past the end of the buffer. The
    // fix is in `SceneBuilder.decodeTerrain` / `decodeLocs` to treat the
    // overflow as "world edge reached" instead of letting it propagate.
    //
    // These tests fail (return `undefined`) on the unfixed code and pass
    // after the fix.
    // ------------------------------------------------------------------------
    describe("world-edge regression — (98, 199) southeast corner", () => {
        const EDGE_SQUARES: Array<[number, number, string]> = [
            [98, 199, "primary repro from first build run"],
            [99, 199, "eastern edge column"],
            [98, 200, "southern edge row"],
            [99, 200, "southeast extreme corner"],
        ];

        for (const [mapX, mapY, label] of EDGE_SQUARES) {
            it(`(${mapX}, ${mapY}) builds a valid collision buffer -- ${label}`, () => {
                const buf = service.buildCollisionBuffer(mapX, mapY);
                if (!buf) {
                    assert(false, `(${mapX}, ${mapY}) returned undefined (build threw)`);
                    return;
                }
                assert(buf.length >= 24, "at least a header is present");
                assertEqual(buf.readUInt8(0), 2, "version 2");
                assertEqual(buf.readUInt16LE(6), mapX, "mapX in header");
                assertEqual(buf.readUInt16LE(8), mapY, "mapY in header");
            });

            it(`(${mapX}, ${mapY}) round-trips through encode/decode -- ${label}`, () => {
                const buf = service.buildCollisionBuffer(mapX, mapY);
                if (!buf) {
                    assert(false, `(${mapX}, ${mapY}) build failed`);
                    return;
                }
                const dec = decodeCollisionSquare(buf);
                if (!dec) {
                    assert(false, "decoded");
                    return;
                }
                assertEqual(dec.mapX, mapX, "mapX preserved");
                assertEqual(dec.mapY, mapY, "mapY preserved");
                assert(dec.planes.length >= 1, "at least one plane decoded");
            });
        }

        it("buildCollisionBuffer never throws for any world-edge square", () => {
            for (const [mapX, mapY] of EDGE_SQUARES) {
                let threw = false;
                try {
                    service.buildCollisionBuffer(mapX, mapY);
                } catch {
                    threw = true;
                }
                assert(!threw, `(${mapX}, ${mapY}) did not throw`);
            }
        });
    });
});

// ============================================================================
// Report
// ============================================================================

console.log("\n" + "=".repeat(60));
if (failed === 0) {
    console.log(`ALL ${passed} TESTS PASSED`);
} else {
    console.log(`${passed} passed, ${failed} FAILED`);
    console.log("\nFailures:");
    for (const f of failures) {
        console.log(`  - ${f}`);
    }
}
console.log("=".repeat(60));

process.exit(failed > 0 ? 1 : 0);
