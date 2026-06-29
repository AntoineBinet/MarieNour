// Détection « est-ce une image ? » tolérante aux formats que les navigateurs
// ne typent pas toujours (HEIC/HEIF des iPhones, où file.type est souvent vide).
// On accepte donc soit un type MIME image/*, soit une extension d'image connue.

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|heic|heif|svg|ico)$/i;

/** Attribut accept pour les <input type="file"> d'images (large, inclut HEIC). */
export const IMAGE_ACCEPT = "image/*,.heic,.heif,.avif";

/** Le fichier est-il (vraisemblablement) une image, quel que soit le format ? */
export function isImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith("image/");
  return IMAGE_EXT_RE.test(file.name || "");
}

// ── Compression côté client ──────────────────────────────────────────────────
// La VM de prod est une micro-instance (1 vCPU / 1 Go) : envoyer des photos de
// 10-25 Mo la sollicite inutilement (réseau, disque, mémoire). On redimensionne
// et ré-encode l'image dans le navigateur AVANT l'upload. Tout échec (format non
// décodable comme certains HEIC, navigateur ancien…) retombe sur le fichier
// d'origine : la fonction ne casse jamais un envoi.

const MAX_DIMENSION = 2200; // côté le plus long, en px
const COMPRESS_QUALITY = 0.82;
const SKIP_BELOW_BYTES = 600 * 1024; // en-dessous, pas la peine de recompresser

async function loadBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    // imageOrientation: respecte l'EXIF (sinon les photos portrait tournent).
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    return null;
  }
}

/**
 * Compresse une image si c'est pertinent. Renvoie un nouveau File (jpeg) ou le
 * fichier d'origine si la compression n'apporte rien / échoue. Ne touche jamais
 * aux GIF (animation), SVG, ni aux non-images.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    if (!isImageFile(file)) return file;
    const type = (file.type || "").toLowerCase();
    if (type === "image/gif" || type === "image/svg+xml") return file;
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

    const bmp = await loadBitmap(file);
    if (!bmp) return file;

    const longest = Math.max(bmp.width, bmp.height);
    const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
    // Rien à gagner : déjà petit ET pas surdimensionné → on garde l'original.
    if (scale === 1 && file.size < SKIP_BELOW_BYTES) {
      bmp.close?.();
      return file;
    }

    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", COMPRESS_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file; // pas plus léger → on garde l'original

    const baseName = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file; // best-effort : ne jamais bloquer un envoi
  }
}
