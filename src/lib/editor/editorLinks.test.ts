import { describe, expect, it } from "vitest";
import { editorHref, templateFromParam } from "./editorLinks";

describe("editor links", () => {
  it("links the gallery's chosen card into the editor", () => {
    expect(editorHref("gift-atelier")).toBe("/editor?template=gift-atelier");
  });

  it("accepts a known template from the query", () => {
    expect(templateFromParam("snow-town")).toBe("snow-town");
  });

  it("falls back to the first template for anything else", () => {
    expect(templateFromParam("<script>")).toBe("winter-moonlight");
    expect(templateFromParam(null)).toBe("winter-moonlight");
  });
});
