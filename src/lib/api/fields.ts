import type { z } from "zod";

/**
 * Zod's issues as the first message per field, the shape `error.fields`
 * carries. Plain Zod, so a form in the browser reads it the same way.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const names =
      issue.code === "unrecognized_keys"
        ? issue.keys
        : [issue.path.join(".") || "form"];
    for (const name of names) {
      fields[name] ??=
        issue.code === "unrecognized_keys"
          ? "Not a field for this type."
          : issue.message;
    }
  }
  return fields;
}
