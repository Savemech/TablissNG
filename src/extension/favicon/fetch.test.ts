import {
  extractIconUrls,
  isLocalHostname,
  isLocalPageUrl,
  permissionOriginForUrl,
  providerUrl,
} from "./fetch";

describe("favicon URL policy", () => {
  test("detects homelab and private network hosts", () => {
    expect(isLocalHostname("pve")).toBe(true);
    expect(isLocalHostname("immich.local")).toBe(true);
    expect(isLocalHostname("192.168.1.20")).toBe(true);
    expect(isLocalHostname("172.31.4.2")).toBe(true);
    expect(isLocalHostname("10.0.0.1")).toBe(true);
    expect(isLocalHostname("8.8.8.8")).toBe(false);
    expect(isLocalHostname("example.com")).toBe(false);
    expect(isLocalHostname("fckeditor.com")).toBe(false);
    expect(isLocalPageUrl("http://sm-nas:8080/photos")).toBe(true);
  });

  test("creates the narrowest host permission pattern", () => {
    expect(permissionOriginForUrl("https://example.com/path")).toBe(
      "https://example.com/*",
    );
    expect(permissionOriginForUrl("http://pve:8006/")).toBe(
      "http://pve:8006/*",
    );
    expect(permissionOriginForUrl("file:///tmp/icon.png")).toBeUndefined();
  });

  test("extracts and resolves declared icon links", () => {
    const html = `
      <link rel="stylesheet" href="/style.css">
      <link sizes="32x32" href='/assets/icon.png' rel='icon'>
      <link rel="apple-touch-icon" href="https://cdn.example/touch.png">
      <link rel="icon" href="javascript:alert(1)">
    `;
    expect(extractIconUrls(html, "https://example.com/app/")).toEqual([
      "https://example.com/assets/icon.png",
      "https://cdn.example/touch.png",
    ]);
  });

  test("builds privacy-explicit third-party provider URLs", () => {
    expect(providerUrl("duckduckgo", "https://example.com/path")).toBe(
      "https://icons.duckduckgo.com/ip3/example.com.ico",
    );
    expect(providerUrl("google", "https://example.com/path")).toContain(
      "domain_url=https%3A%2F%2Fexample.com%2Fpath",
    );
  });
});
