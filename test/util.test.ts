import { describe, expect, it } from "vitest";
import { isBlockedPreviewHost, safeServedContentType, isImageUpload, isImageOrVideoUpload } from "../server/util";

describe("isBlockedPreviewHost (garde SSRF)", () => {
  it("bloque le réseau interne / métadonnées cloud", () => {
    for (const h of [
      "localhost",
      "app.localhost",
      "router.local",
      "metadata",
      "metadata.internal",
      "127.0.0.1",
      "0.0.0.0",
      "10.1.2.3",
      "192.168.0.1",
      "172.16.5.4",
      "172.31.255.255",
      "169.254.169.254", // endpoint de métadonnées cloud
      "100.100.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
    ]) {
      expect(isBlockedPreviewHost(h), h).toBe(true);
    }
  });

  it("laisse passer les hôtes publics légitimes", () => {
    for (const h of ["example.com", "youtube.com", "8.8.8.8", "172.32.0.1", "100.63.0.1", "1.1.1.1"]) {
      expect(isBlockedPreviewHost(h), h).toBe(false);
    }
  });
});

describe("safeServedContentType (anti XSS via fichier)", () => {
  it("neutralise les types exécutables, conserve image/vidéo", () => {
    expect(safeServedContentType("text/html")).toBe("application/octet-stream");
    expect(safeServedContentType("image/svg+xml")).toBe("application/octet-stream");
    expect(safeServedContentType("application/javascript")).toBe("application/octet-stream");
    expect(safeServedContentType("")).toBe("application/octet-stream");
    expect(safeServedContentType("image/png")).toBe("image/png");
    expect(safeServedContentType("image/jpeg; charset=utf-8")).toBe("image/jpeg");
    expect(safeServedContentType("video/mp4")).toBe("video/mp4");
  });
});

describe("whitelist d'upload", () => {
  it("isImageUpload : image OU type vide accepté, reste rejeté", () => {
    expect(isImageUpload("image/png")).toBe(true);
    expect(isImageUpload("")).toBe(true);
    expect(isImageUpload("text/html")).toBe(false);
    expect(isImageUpload("video/mp4")).toBe(false);
  });
  it("isImageOrVideoUpload : image, vidéo OU type vide", () => {
    expect(isImageOrVideoUpload("image/png")).toBe(true);
    expect(isImageOrVideoUpload("video/mp4")).toBe(true);
    expect(isImageOrVideoUpload("")).toBe(true);
    expect(isImageOrVideoUpload("text/html")).toBe(false);
  });
});
