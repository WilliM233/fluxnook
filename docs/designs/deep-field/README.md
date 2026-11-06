# Deep Field

Repo mirror of the Deep Field design system, https://claude.ai/artifact/BFgHbCApeRScHbeeusWdxq (private; `tokens.json` beside this file is its token sheet). Made at the Ch 1.3 design talk from the code; re-exported whenever the system changes.

The look of Fluxnook, a hosted media nook: films, TV, books, comics and games on shelves, each read or watch logged with stars and a journal entry. Chosen on the Ch 1.2 palette board over Nebula and Dusk; built in `src/app/globals.css` as ten `--fn-*` variables that shadcn's tokens point at, so a theme later is one more block of values.

Read this first. Every value here is the one in the code; where the code and this book disagree, the code is right and this book is stale.

## What it is for

A quiet, dark room where the covers are the color. The ground is a near-black violet, the surface one step lighter, and there is one accent, a lavender, spent on the few things you can act on. Posters and book covers bring the warmth; nothing in the chrome competes with them.

## Principles

- **Covers carry the warmth.** The palette has no warm hue of its own. A row with a poster looks lit; a row without one gets a dashed box in `line-strong` and the words "no poster" in `dim`, never a placeholder picture.
- **One accent, spent carefully.** `accent` means you can act on this or it is yours: the primary button, a link, "In your catalog", the selected side of the match sheet, the focus ring. It is never a wash behind text.
- **Edges are lines, not shadows.** Cards and rows are `surface` with a `line` border. The only shadow on any screen is under the item page's cover.
- **Two faces.** Fraunces for anything that names a work or a place (titles, the wordmark, row titles); Inter for everything you read or act on. Fraunces at 600 for most titles, at 400 for a page heading so it sits back.
- **Three steps of text.** `text` for what matters, `muted` for the second line, `dim` for the third and for anything 13px or under. Nothing lighter than `dim` exists.
- **Private by default, plain in words.** Errors say what went wrong and what to do ("Search for at least two characters", "That item already has TMDB source movie/133805"). Whimsy lives in the names of things (the nook, a shelf, a Rummage), not in a message someone has to act on.

## Color

Eleven tokens, one theme. `ground`, `surface`, `line`, `line-strong` are the room; `text`, `muted`, `dim` are the three steps of type; `accent`, `accent-hover`, `accent-ink` are the one color; `destructive` is shadcn's red, kept for field errors only.

Contrast on the grounds the screens use: `text` 14.9:1 on `ground`; `muted` 7.4:1 on `ground` and 6.3:1 on `surface`; `dim` 4.6:1 on `ground` and 3.9:1 on `surface`, so `dim` stays at 13px and under on `ground`, and on `surface` only inside the no-poster box and a row's status line where the type is 13px and the words are not the point. `accent-ink` on `accent` is 10.1:1.

The three catalog states on a search row use color as a signal, backed by words: **in** is "In your catalog" in `accent`; **match** is "Looks like one you have: Carrie (2013), from Letterboxd" in `muted`; **new** says nothing, or the count of seasons in `dim`.

## Typography

Fraunces and Inter from Google Fonts through `next/font`, as `--font-heading` and `--font-sans`. Fraunces is loaded at 400 and 600 with its optical-size axis; Inter at its default weights.

The scale, by use: `item-title` 48, `page-title` 34, `sheet-title` 28, `wordmark` 26, `row-title` 22, `section-title` 19, `link-title` 18 in Fraunces; `input` 17, `lede` 16, `body` 14, `small` 13, `caption` 12, `label` 11 and `label-wide` 12 (both uppercase, tracked), `tiny` 10 in Inter. Nothing between these sizes.

Dates are written out at their precision: "16 October 2013", "May 1984", "1979". Counts are plain: "2 seasons", "101 min", "304 pages". Numbers that line up in columns take `font-variant-numeric: tabular-nums`.

## Spacing and shape

Tailwind's 4px scale; the tokens name the steps the screens use, from `space-0.5` (a fact label to its value) to `space-11` (the item page's outer padding). A result row is `space-3.5` inside and `space-4` between its thumb and its text; rows stack with `space-3.5` between them.

Radii come off `--radius: 0.625rem`: `radius-md` 8 for a thumb, `radius-lg` 10 for a button, `radius-xl` 14 for an input, a sheet card or the item cover, `radius-2xl` 18 for a result row, `radius-full` for a pill. The row's radius is larger than the thumb's inside it, always.

## Layout

The signed-in shell is a header (wordmark, Search, Nook, the email, Sign out) and a footer (the TMDB attribution line and mark, which TMDB's terms require), both with a `line` rule and `space-4` side padding at phone width, `space-10` from `sm` up. Pages sit between them. The item page is a two-column grid from `md` up (280px cover column, the rest for facts) and one column at 390px, cover first. The search page is one column at every width: heading, the input and the chip rail on one wrapping line, then the rows.

## Iconography

None yet. The screens use words where another app would use an icon ("Open", "Add", "Sign out"). The one mark is TMDB's, in `public/tmdb/blue_short.svg`, used only in the footer as their terms ask. When Open Library data lands (Ch 1.3), the footer gains a plain line, "Book data from Open Library", with no mark.

## Components

`Button` (primary and outline, the two the screens use), `ResultRow` (a search or recent row in its three states), `TypePill` (the uppercase type chip) and `Thumb` (a cover at row or sheet size, or the no-poster box). Each component's README says what the consumer provides. The previews are plain HTML on the tokens, not the React components in `src/components/`; the code is the source, the previews show the look.

## What's not here

A light theme, Nebula and Dusk: drawn on the Ch 1.2 palette board, deferred until a theme setting exists. Charts, sidebars and the shadcn tokens the screens don't use (`--chart-*`, `--sidebar-*`) are mapped in `globals.css` but have no screen and no place in this book.
