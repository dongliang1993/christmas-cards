import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/dev/bake: dev-only asset writer", () => {
  it("refuses outside development (vitest runs with NODE_ENV=test)", async () => {
    const form = new FormData();
    form.set("card", "winter-moonlight");
    const res = await POST(new Request("http://localhost/api/dev/bake", { method: "POST", body: form }));
    expect(res.status).toBe(403);
  });
});
