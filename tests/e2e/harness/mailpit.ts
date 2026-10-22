import { type APIRequestContext, expect } from "@playwright/test";

// The local stack's mail catcher, `[local_smtp] port` in supabase/config.toml.
const MAILPIT = "http://127.0.0.1:54324";

type SearchResult = { messages: { ID: string }[] };

/**
 * The sign-in link from the newest mail to `email`, polled for up to ten
 * seconds because Mailpit can index a beat after the send. Never call
 * Mailpit's `link-check` endpoint: it follows every link, which spends the
 * one-time token.
 */
export async function waitForMagicLink(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const search = `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
  let id = "";
  await expect
    .poll(
      async () => {
        const result: SearchResult = await (await request.get(search)).json();
        id = result.messages[0]?.ID ?? "";
        return id;
      },
      { message: `no mail to ${email} in Mailpit`, timeout: 10_000 },
    )
    .not.toBe("");

  const message: { Text: string } = await (
    await request.get(`${MAILPIT}/api/v1/message/${id}`)
  ).json();
  // The Text body wraps the link in parentheses: "Sign in ( http://… )".
  const link = message.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?\S+/)?.[0];
  if (!link) {
    throw new Error(`The mail to ${email} has no /auth/v1/verify link.`);
  }
  return link.replace(/\)$/, "");
}
