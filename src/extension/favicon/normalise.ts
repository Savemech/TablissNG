import { FAVICON_SYNC_MAX_BINARY_BYTES } from "./sync";

const OUTPUT_SIZES = [96, 80, 64, 48, 32] as const;
const WEBP_QUALITIES = [0.9, 0.78, 0.64] as const;

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | undefined> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? undefined), type, quality),
  );
}

/**
 * Produce a small, decoded icon suitable for storage.sync. The original stays
 * in IndexedDB; this copy is deliberately bounded by the cross-browser quota.
 */
export async function normaliseFaviconForSync(input: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(input);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () =>
        reject(new Error("The source image could not be decoded"));
      candidate.src = objectUrl;
    });
    for (const size of OUTPUT_SIZES) {
      const scale = Math.min(
        1,
        size / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(image, 0, 0, width, height);

      for (const quality of WEBP_QUALITIES) {
        const encoded = await canvasBlob(canvas, "image/webp", quality);
        if (
          encoded?.type === "image/webp" &&
          encoded.size > 0 &&
          encoded.size <= FAVICON_SYNC_MAX_BINARY_BYTES
        ) {
          return encoded;
        }
      }

      const png = await canvasBlob(canvas, "image/png");
      if (png && png.size > 0 && png.size <= FAVICON_SYNC_MAX_BINARY_BYTES) {
        return png;
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  throw new Error("The icon could not be compressed for browser sync");
}
