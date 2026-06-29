// En-têtes de sécurité partagés (VM Node + repli serverless Cloudflare).
//
// Content-Security-Policy ADAPTÉE au front réel :
//   • un seul script : le bundle Vite hashé servi depuis la même origine
//     (aucun script inline) → script-src 'self' ;
//   • styles : feuille bundlée (self) + Google Fonts CSS + styles inline
//     éventuels (thème, CSSOM) → style-src 'self' 'unsafe-inline' fonts.googleapis ;
//   • polices : Google Fonts (gstatic) + data: ;
//   • images : self + data:/blob: (aperçus locaux) + https: (avatars, médias,
//     vignettes d'aperçu de lien, miniatures YouTube…) ;
//   • appels réseau : même origine (/api) uniquement ;
//   • service worker : self ; pas d'embarquement en iframe.
// 'unsafe-inline' est gardé sur style-src (le risque d'injection de style est
// faible) pour ne pas casser le thème ; il est volontairement ABSENT de script-src.
import { secureHeaders } from "hono/secure-headers";

const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

/** Middleware secureHeaders configuré (nosniff, X-Frame-Options, HSTS,
 *  Referrer-Policy… + la CSP ci-dessus). */
export function createSecureHeaders() {
  return secureHeaders({ contentSecurityPolicy: CSP });
}
