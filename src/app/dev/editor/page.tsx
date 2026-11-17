import { notFound } from "next/navigation";
import { EditorPreview } from "./EditorPreview";

/** Dev-only fixture: the in-card editor without the rest of the flow. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EditorPreview />;
}
