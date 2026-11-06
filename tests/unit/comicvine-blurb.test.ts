import { describe, expect, it } from "vitest";
import { cleanHtmlBlurb } from "@/lib/providers/comicvine";

// Comic Vine's descriptions are HTML: the summary is the first paragraph
// with words in it, as plain text (A2, the 1.3 blurb rule's shape).

describe("cleanHtmlBlurb", () => {
  it.each([
    [
      "<p>The Turtles &amp; Splinter.</p><p>Second.</p>",
      "The Turtles & Splinter.",
    ],
    ["<h4>Contents</h4><p> </p><p>Real</p>", "Real"],
    ["<p>Raph&#39;s and Leo&#x27;s</p>", "Raph's and Leo's"],
    ["<p>a<br>b</p>", "a b"],
    ["<p>a<br/>b</p>", "a b"],
    [
      '<p><a href="/x/4005-1/">April</a>   O&apos;Neil&nbsp;calls.</p>',
      "April O'Neil calls.",
    ],
    ["<p>&lt;b&gt; stays text</p>", "<b> stays text"],
    ["<p>An &unknown; entity</p>", "An &unknown; entity"],
    ["No tags at all", "No tags at all"],
    ["<p>It&rsquo;s a trap&hellip;</p>", "It’s a trap…"],
  ])("%s", (html, text) => {
    expect(cleanHtmlBlurb(html)).toBe(text);
  });

  it.each([["<p></p>"], ["<p>  </p><p>&nbsp;</p>"], [""], [null], [undefined]])(
    "%s is null",
    (html) => {
      expect(cleanHtmlBlurb(html)).toBeNull();
    },
  );
});
