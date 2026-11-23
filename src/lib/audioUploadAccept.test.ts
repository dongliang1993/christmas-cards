import { describe, expect, it } from "vitest";
import { AUDIO_UPLOAD_ACCEPT, AUDIO_UPLOAD_EXTENSIONS } from "./audioUploadAccept";
import { validateUpload } from "./server/uploadStore";

describe("AUDIO_UPLOAD_ACCEPT", () => {
  it("names every extension explicitly, since iOS greys out audio files under audio/* alone", () => {
    expect(AUDIO_UPLOAD_ACCEPT.split(",")).toEqual(["audio/*", ...AUDIO_UPLOAD_EXTENSIONS.map((e) => `.${e}`)]);
  });

  it("lists exactly the formats the server accepts", () => {
    for (const ext of AUDIO_UPLOAD_EXTENSIONS) {
      expect(validateUpload({ name: `a.${ext}`, type: "", size: 1 }).ok).toBe(true);
    }
    expect(AUDIO_UPLOAD_EXTENSIONS).toEqual(expect.arrayContaining(["mp3", "m4a"]));
  });
});
