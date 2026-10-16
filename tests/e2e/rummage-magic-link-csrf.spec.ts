import { expect, test } from "@playwright/test";

// Rummage R3. Login CSRF. A page on any origin can auto-submit a
// <form enctype="text/plain"> whose body parses as JSON; no preflight, so the
// victim's browser gets the PKCE verifier cookie for a link mailed to the
// attacker. The attacker then sends the victim to that link and the victim is
// signed in to the attacker's nook, where their journal entries will land.
// Only application/json, which a cross-origin page can't send without a
// preflight this app never answers, should reach signInWithOtp.
for (const contentType of [
  "text/plain",
  "application/x-www-form-urlencoded",
  "multipart/form-data; boundary=x",
]) {
  test(`magic-link refuses a ${contentType.split(";")[0]} body with 415`, async ({
    request,
  }) => {
    const response = await request.post("/api/v1/auth/magic-link", {
      headers: { "content-type": contentType, origin: "https://evil.example" },
      data: '{"email":"csrf-rummage@example.com","x":"="}',
    });
    expect(response.status()).toBe(415);
  });
}
