import { CollisionMap } from "../../../src/rs/scene/CollisionMap";
import { bitsetByteLength, bitsetSet } from "../utils/bitset";
import { ServerMapSquare } from "./MapCollisionService";

/**
 * Encodes a single collision plane into the on-disk format.
 *
 * Layout:
 *   uint16LE sizeX
 *   uint16LE sizeY
 *   uint32LE flagCount
 *   int32LE[flagCount] flags
 */
export function encodeCollisionPlane(map: CollisionMap): Buffer {
    const header = Buffer.alloc(8);
    header.writeUInt16LE(map.sizeX, 0);
    header.writeUInt16LE(map.sizeY, 2);
    header.writeUInt32LE(map.flags.length, 4);
    // flags are an Int32Array with byteOffset 0; we can wrap the underlying ArrayBuffer
    // directly. This avoids an extra full-buffer copy for the typical case.
    const flags = Buffer.from(map.flags.buffer, map.flags.byteOffset, map.flags.byteLength);
    return Buffer.concat([header, flags]);
}

export type EncodedSquareMeta = {
    version: number;
    borderSize: number;
    size: number;
    planeCount: number;
    mapX: number;
    mapY: number;
    baseX: number;
    baseY: number;
};

/**
 * Encodes a server map square into the on-disk v2 collision cache format.
 *
 * Layout (v2):
 *   [0..23]   header (see encodeSquareHeader)
 *   [..]      per-plane buffers (encodeCollisionPlane)
 *   [..]      meta footer (see encodeSquareMeta)
 *
 * The meta footer is what lets the server resolve tile min-level / bridge planes
 * without rebuilding the scene at runtime.
 */
export function encodeCollisionSquare(square: ServerMapSquare): Buffer {
    const header = encodeSquareHeader({
        version: 2,
        borderSize: square.borderSize,
        size: square.size,
        planeCount: square.collisionMaps.length,
        mapX: square.mapX,
        mapY: square.mapY,
        baseX: square.baseX,
        baseY: square.baseY,
    });

    const planeBuffers: Buffer[] = new Array(square.collisionMaps.length);
    for (let i = 0; i < square.collisionMaps.length; i++) {
        planeBuffers[i] = encodeCollisionPlane(square.collisionMaps[i]);
    }

    const meta = encodeSquareMeta(square);

    return Buffer.concat([header, ...planeBuffers, meta]);
}

function encodeSquareHeader(meta: EncodedSquareMeta): Buffer {
    const header = Buffer.alloc(24);
    header.writeUInt8(meta.version, 0);
    header.writeUInt8(meta.borderSize & 0xff, 1);
    header.writeUInt16LE(meta.size & 0xffff, 2);
    header.writeUInt8(meta.planeCount & 0xff, 4);
    header.writeUInt8(0, 5); // reserved
    header.writeUInt16LE(meta.mapX & 0xffff, 6);
    header.writeUInt16LE(meta.mapY & 0xffff, 8);
    header.writeInt32LE(meta.baseX, 10);
    header.writeInt32LE(meta.baseY, 14);
    header.writeUInt16LE(meta.size & 0xffff, 18); // duplicate for compatibility
    header.writeUInt16LE(meta.borderSize & 0xffff, 20);
    header.writeUInt16LE(0, 22); // reserved padding
    return header;
}

/**
 * Meta footer for v2 collision cache.
 *
 *   uint32LE bitsetByteLen
 *   uint8[bitsetByteLen]  linkBelowBitset     (tileRenderFlags[1] & 0x2)
 *   uint8[bitsetByteLen]  forceMin0Bitset[0]  (tileRenderFlags[0] & 0x8)
 *   uint8[bitsetByteLen]  forceMin0Bitset[1]  (tileRenderFlags[1] & 0x8)
 *   uint8[bitsetByteLen]  forceMin0Bitset[2]  (tileRenderFlags[2] & 0x8)
 *   uint8[bitsetByteLen]  forceMin0Bitset[3]  (tileRenderFlags[3] & 0x8)
 *
 * Stored once per square so the server doesn't need to rebuild scenes to know
 * which plane a tile is physically rendered on.
 */
function encodeSquareMeta(square: ServerMapSquare): Buffer {
    const tileCount = square.size * square.size;
    const bitsetLen = bitsetByteLength(tileCount);

    const metaHeader = Buffer.alloc(4);
    metaHeader.writeUInt32LE(bitsetLen >>> 0, 0);

    const linkBelow = new Uint8Array(bitsetLen);
    const forceMin0: Uint8Array[] = new Array(4);
    for (let l = 0; l < 4; l++) forceMin0[l] = new Uint8Array(bitsetLen);

    const flags = square.tileRenderFlags;
    if (flags) {
        const size = square.size;
        for (let x = 0; x < size; x++) {
            const row = flags[0]?.[x];
            const row1 = flags[1]?.[x];
            const row2 = flags[2]?.[x];
            const row3 = flags[3]?.[x];
            for (let y = 0; y < size; y++) {
                const idx = x * size + y;
                const link = ((row1?.[y] ?? 0) & 0x2) !== 0;
                bitsetSet(linkBelow, idx, link);
                bitsetSet(forceMin0[0], idx, ((row?.[y] ?? 0) & 0x8) !== 0);
                bitsetSet(forceMin0[1], idx, ((row1?.[y] ?? 0) & 0x8) !== 0);
                bitsetSet(forceMin0[2], idx, ((row2?.[y] ?? 0) & 0x8) !== 0);
                bitsetSet(forceMin0[3], idx, ((row3?.[y] ?? 0) & 0x8) !== 0);
            }
        }
    }

    return Buffer.concat([
        metaHeader,
        Buffer.from(linkBelow.buffer, linkBelow.byteOffset, linkBelow.byteLength),
        Buffer.from(forceMin0[0].buffer, forceMin0[0].byteOffset, forceMin0[0].byteLength),
        Buffer.from(forceMin0[1].buffer, forceMin0[1].byteOffset, forceMin0[1].byteLength),
        Buffer.from(forceMin0[2].buffer, forceMin0[2].byteOffset, forceMin0[2].byteLength),
        Buffer.from(forceMin0[3].buffer, forceMin0[3].byteOffset, forceMin0[3].byteLength),
    ]);
}
