import { expect, it } from "vitest";
import { coverStoreFromEnv } from "@/lib/covers";

// Storage is in the stack and the secret key reaches it: the server's cover
// store can talk to the service before any bucket exists.

it("the cover store reaches Storage with the secret key", async () => {
  const buckets = await coverStoreFromEnv().listBuckets();
  expect(Array.isArray(buckets)).toBe(true);
});

it("the covers bucket exists and is public", async () => {
  const buckets = await coverStoreFromEnv().listBuckets();
  expect(buckets.find((bucket) => bucket.id === "covers")).toMatchObject({
    public: true,
  });
});
