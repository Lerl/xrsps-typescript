import { MinimapImageRenderer } from "../../rs/map/MinimapImageRenderer";
import { Scene } from "../../rs/scene/Scene";

export type MinimapPixelData = {
    width: number;
    height: number;
    pixels: Uint8Array;
};

export function loadMinimapPixels(
    minimapImageRenderer: MinimapImageRenderer,
    scene: Scene,
    level: number,
    borderSize: number,
    drawMapFunctions: boolean,
): MinimapPixelData {
    const minimapPixels = minimapImageRenderer.renderMinimapHd(scene, level, drawMapFunctions);

    const minimapView = new DataView(minimapPixels.buffer);
    for (let i = 0; i < minimapPixels.length; i++) {
        minimapView.setUint32(i * 4, (minimapPixels[i] << 8) | 0xff);
    }

    const width = (scene.sizeX - borderSize * 2) * 4;
    const height = (scene.sizeY - borderSize * 2) * 4;
    const fullWidth = scene.sizeX * 4;
    const source = new Uint8Array(minimapPixels.buffer);
    const pixels = new Uint8Array(width * height * 4);
    const sourceStartX = borderSize * 4;
    const sourceStartY = borderSize * 4;
    for (let y = 0; y < height; y++) {
        const sourceOffset = ((sourceStartY + y) * fullWidth + sourceStartX) * 4;
        const targetOffset = y * width * 4;
        pixels.set(source.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
    }

    return { width, height, pixels };
}

export async function loadMinimapBlob(
    minimapImageRenderer: MinimapImageRenderer,
    scene: Scene,
    level: number,
    borderSize: number,
    drawMapFunctions: boolean,
): Promise<Blob> {
    const minimapPixels = minimapImageRenderer.renderMinimapHd(scene, level, drawMapFunctions);

    const minimapView = new DataView(minimapPixels.buffer);
    for (let i = 0; i < minimapPixels.length; i++) {
        minimapView.setUint32(i * 4, (minimapPixels[i] << 8) | 0xff);
    }

    const widthExclBorder = (scene.sizeX - borderSize * 2) * 4;
    const heightExclBorder = (scene.sizeY - borderSize * 2) * 4;
    const canvas = new OffscreenCanvas(widthExclBorder, heightExclBorder);
    const contextOptions: CanvasRenderingContext2DSettings = { willReadFrequently: true };
    const ctx = canvas.getContext("2d", contextOptions);
    if (!ctx) {
        throw new Error("Could not get canvas context");
    }

    const pixelWidth = scene.sizeX * 4;
    const pixelHeight = scene.sizeY * 4;
    const imageData = new ImageData(pixelWidth, pixelHeight);
    imageData.data.set(new Uint8ClampedArray(minimapPixels.buffer));

    ctx.putImageData(imageData, -borderSize * 4, -borderSize * 4);

    return canvas.convertToBlob();
}
