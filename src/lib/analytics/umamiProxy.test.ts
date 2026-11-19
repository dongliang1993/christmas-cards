import { describe, expect, it } from "vitest";
import { beaconHeaders } from "./umamiProxy";

describe("beaconHeaders", () => {
  it("passes the visitor IP from Cloudflare and the user agent on to Umami", () => {
    const h = beaconHeaders(
      new Headers({ "cf-connecting-ip": "203.0.113.7", "user-agent": "UA/1", "accept-language": "zh-CN", cookie: "x=1" }),
    );
    expect(h.get("x-umami-client-ip")).toBe("203.0.113.7");
    expect(h.get("user-agent")).toBe("UA/1");
    expect(h.get("accept-language")).toBe("zh-CN");
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("cookie")).toBeNull();
  });

  it("falls back to the first x-forwarded-for hop when Cloudflare's header is absent", () => {
    const h = beaconHeaders(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }));
    expect(h.get("x-umami-client-ip")).toBe("198.51.100.2");
  });

  it("sends no client IP header when none is known", () => {
    expect(beaconHeaders(new Headers()).get("x-umami-client-ip")).toBeNull();
  });
});
