import { describe, expect, it } from "vitest";
import { editionContentsSchema } from "@/app/api/v1/editions/[id]/contents/schema";
import { fieldErrors } from "@/lib/api/fields";

// Raccoon, Ch 1.4.3 R3: a uuid is the same comic in any case. `z.uuid()`
// takes both spellings and Postgres treats them as one id, so "each once"
// has to compare folded ids; today the pair slips past the schema and comes
// back from the write as "not a comic in the catalog", which it is.

const a = "7a1b2c3d-0000-4000-8000-00000000000a";

describe("editionContentsSchema, the same id twice in two cases", () => {
  it("is refused at items as 'Each comic once.'", () => {
    const parsed = editionContentsSchema.safeParse({
      items: [a, a.toUpperCase()],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrors(parsed.error)).toEqual({ items: "Each comic once." });
  });
});
