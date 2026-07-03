/**
 * Phân tích mask PNG để lấy bounding box và ước lượng mm.
 *
 * Lưu ý: backend KHÔNG trả bbox / mm — toàn bộ tính toán này chạy client-side
 * bằng cách parse mask_base64 và quét pixel.
 *
 * Ước lượng mm dựa trên giả định:
 *   - Working distance khoảng 30mm (đầu ống soi đến niêm mạc).
 *   - Field of view ~140°, tương đương đường kính vùng quan sát ~30mm ở mặt phẳng niêm mạc.
 *
 * Đây là con số ước lượng, chỉ dùng cho UI — không thay thế đo thực tế bằng snare mở.
 */

export const ENDOSCOPE_FOV_MM = 30;

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  imageW: number;
  imageH: number;
}

/**
 * Tải một data URL hoặc URL thành HTMLCanvasElement (đã vẽ xong).
 * Hữu ích cho cả mask lẫn ảnh gốc.
 */
export function dataUrlToCanvas(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context không khả dụng"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Không tải được ảnh"));
    img.src = src;
  });
}

/**
 * Tính bounding box của vùng mask (pixel đậm).
 * Quét 1 lượt, tìm min/max của pixel có alpha > 128 và không trắng tuyệt đối.
 *
 * @param maskBase64 PNG dạng data URL ("data:image/png;base64,...")
 * @returns null nếu ảnh rỗng / toàn trắng; bounding box nếu có vùng đậm.
 */
export async function extractBoundingBox(maskBase64: string | null | undefined): Promise<BoundingBox | null> {
  if (!maskBase64) return null;

  const canvas = await dataUrlToCanvas(maskBase64);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  // Alpha > 128 AND không trắng (R<250 HOẶC G<250 HOẶC B<250) → pixel thuộc mask.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (a > 128 && (r < 250 || g < 250 || b < 250)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    imageW: width,
    imageH: height,
  };
}

/**
 * Ước lượng mm của vùng bbox theo công thức:
 *   mm ≈ (bbox_width_px / image_width_px) * ENDOSCOPE_FOV_MM
 *
 * @param bbox Output của extractBoundingBox
 * @param fov Đường kính vùng quan sát (mm) — mặc định 30mm
 */
export function estimateMmFromBBox(bbox: BoundingBox, fov: number = ENDOSCOPE_FOV_MM): number {
  if (!bbox || bbox.imageW === 0) return 0;
  return Math.max(0, (bbox.w / bbox.imageW) * fov);
}

/**
 * Crop vùng quanh bbox từ ảnh nguồn, trả về data URL JPEG.
 * Dùng cho "Ảnh zoom tổn thương" trong Key Image Selection.
 */
export async function cropZoomAroundBBox(
  srcBase64: string,
  bbox: BoundingBox | null,
  outMaxWidth = 800,
  quality = 0.85,
): Promise<string> {
  const canvas = await dataUrlToCanvas(srcBase64);
  const ctx = canvas.getContext("2d");
  if (!ctx) return srcBase64;

  let sx = 0;
  let sy = 0;
  let sw = canvas.width;
  let sh = canvas.height;

  if (bbox && bbox.w > 0 && bbox.h > 0) {
    // Pad 30% quanh bbox để thấy chút bối cảnh.
    const padX = Math.round(bbox.w * 0.3);
    const padY = Math.round(bbox.h * 0.3);
    sx = Math.max(0, bbox.x - padX);
    sy = Math.max(0, bbox.y - padY);
    sw = Math.min(canvas.width - sx, bbox.w + 2 * padX);
    sh = Math.min(canvas.height - sy, bbox.h + 2 * padY);
  }

  const outRatio = sw / sh;
  const outW = Math.min(outMaxWidth, sw);
  const outH = Math.round(outW / outRatio);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d");
  if (!outCtx) return srcBase64;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outW, outH);
  return out.toDataURL("image/jpeg", quality);
}