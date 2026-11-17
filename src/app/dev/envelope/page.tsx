import { notFound } from "next/navigation";
import { EnvelopePreview } from "./EnvelopePreview";

/** Dev-only fixture for the envelope and wax seal. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EnvelopePreview />;
}
