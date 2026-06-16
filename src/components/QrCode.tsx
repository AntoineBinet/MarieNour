// marienour — rendu d'un QR code en SVG (net à toute taille, imprimable).
// S'appuie sur `qrcode-generator` (sans dépendance, navigateur).
import { useMemo } from "react";
import qrcode from "qrcode-generator";

export interface QrCodeProps {
  value: string;
  size?: number;
  /** Marge (en modules) autour du code. */
  margin?: number;
  className?: string;
  /** Couleur des modules pleins (défaut : encre du thème). */
  color?: string;
  background?: string;
}

export function QrCode({
  value,
  size = 200,
  margin = 2,
  className,
  color = "var(--ink)",
  background = "#fff",
}: QrCodeProps) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M"); // type 0 = auto, ECC niveau M
    qr.addData(value);
    qr.make();
    const c = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < c; r++) {
      for (let col = 0; col < c; col++) {
        if (qr.isDark(r, col)) d += `M${col + margin} ${r + margin}h1v1h-1z`;
      }
    }
    return { path: d, count: c };
  }, [value, margin]);

  const total = count + margin * 2;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label="QR code"
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill={background} rx={1} />
      <path d={path} fill={color} />
    </svg>
  );
}

export default QrCode;
