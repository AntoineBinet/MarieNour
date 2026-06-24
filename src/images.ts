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
