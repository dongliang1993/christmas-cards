import { describe, expect, it } from "vitest";
import { editorHref, templateFromParam } from "./editorLinks";

describe("editor links", () => {
  it("links the gallery's chosen card into the editor", () => {
    expect(editorHref("sweet-dreams")).toBe("/editor?template=sweet-dreams");
  });

  it("accepts a known template from the query", () => {
    expect(templateFromParam("lantern-light")).toBe("lantern-light");
  });

  it("falls back to the first template for anything else", () => {
    expect(templateFromParam("<script>")).toBe("first-snow");
    expect(templateFromParam(null)).toBe("first-snow");
  });
});
