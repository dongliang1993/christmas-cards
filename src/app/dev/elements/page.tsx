import { notFound } from "next/navigation";
import { ElementsPreview } from "./ElementsPreview";

/** Dev-only fixture for checking element rendering in a real browser. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ElementsPreview />;
}
