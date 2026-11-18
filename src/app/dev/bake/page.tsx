import { notFound } from "next/navigation";
import { BakeStudio } from "./BakeStudio";

/** Dev-only studio for generating the cards' prebaked surfaces. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BakeStudio />;
}
