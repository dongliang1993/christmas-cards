import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addStudioLights, SOFTBOX_POS } from "./studio";

describe("addStudioLights: the card's studio, shared with the envelope", () => {
  it("adds the card's ambient, hemisphere, key, softbox and rim lights", () => {
    const scene = new THREE.Scene();
    const s = addStudioLights(scene);
    const kinds = scene.children.map((c) => c.type);
    expect(kinds).toEqual(expect.arrayContaining(["AmbientLight", "HemisphereLight", "DirectionalLight", "RectAreaLight"]));

    expect(s.key.castShadow).toBe(true);
    expect(s.key.intensity).toBeCloseTo(1.45);
    expect(s.key.position.toArray()).toEqual([6.8, 4.8, 3.2]);
    expect(s.key.target).toBe(s.keyTarget);
    expect(s.key.shadow.mapSize.x).toBe(1024);

    expect(s.softbox.intensity).toBeCloseTo(2.2);
    expect(s.softbox.position.toArray()).toEqual(SOFTBOX_POS.toArray());
    expect(s.rim.position.toArray()).toEqual([-5.5, -2, 2.8]);
    expect(s.ambient.intensity).toBeCloseTo(1.3);
  });

  it("can ask for a sharper key shadow (the envelope's paper edges)", () => {
    const s = addStudioLights(new THREE.Scene(), { shadowMapSize: 2048 });
    expect(s.key.shadow.mapSize.x).toBe(2048);
  });
});
