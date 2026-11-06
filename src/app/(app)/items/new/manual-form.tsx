"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { fieldErrors, manualItemSchema } from "@/app/api/v1/items/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookForms, comicForms, seriesKinds } from "@/db/vocabulary";

type Type = "film" | "tv" | "book" | "comic";
const types: { value: Type; label: string }[] = [
  { value: "film", label: "Film" },
  { value: "tv", label: "TV" },
  { value: "book", label: "Book" },
  { value: "comic", label: "Comic" },
];
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const numberFields = [
  "year",
  "month",
  "day",
  "runtimeMinutes",
  "seasons",
  "episodes",
  "number",
];
// Which fields each type sends; the schema refuses any other.
const fieldsFor: Record<Type, string[]> = {
  film: ["runtimeMinutes"],
  tv: ["seasons", "episodes"],
  book: ["form", "author"],
  comic: ["form", "series", "seriesKind", "number"],
};

const selectClass =
  "h-11 w-full rounded-[10px] border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const inputClass = "h-11 rounded-[10px] bg-background px-3";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label
        htmlFor={id}
        className="text-[13px] font-semibold text-muted-foreground"
      >
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The manual entry form (A9): fields by type, errors by field, then the new item's page. */
export function ManualForm() {
  const router = useRouter();
  const [type, setType] = useState<Type>("book");
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const field = (name: string) => ({
    id: name,
    name,
    value: values[name] ?? "",
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => setValues((v) => ({ ...v, [name]: event.target.value })),
  });

  function body() {
    const out: Record<string, unknown> = { type };
    for (const name of [
      "title",
      "year",
      "month",
      "day",
      "summary",
      ...fieldsFor[type],
    ]) {
      const raw = values[name]?.trim();
      if (!raw) continue;
      out[name] = numberFields.includes(name) ? Number(raw) : raw;
    }
    return out;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailed(false);
    const input = body();
    const parsed = manualItemSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const response = await fetch("/api/v1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (response?.status === 201 && result?.id) {
      router.push(`/items/${result.id}`);
      return;
    }
    setPending(false);
    if (response?.status === 400 && result?.error?.fields) {
      setErrors(result.error.fields);
    } else {
      setFailed(true);
    }
  }

  const forms = type === "book" ? bookForms : comicForms;

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-5.5 rounded-2xl border bg-card p-7"
    >
      <Field id="type" label="Type">
        <select
          id="type"
          value={type}
          onChange={(event) => {
            setType(event.target.value as Type);
            setErrors({});
          }}
          className={selectClass}
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field id="title" label="Title" error={errors.title}>
        <Input {...field("title")} className={inputClass} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">
          Released
        </legend>
        <div className="grid grid-cols-3 gap-2.5">
          <Field id="year" label="Year" error={errors.year}>
            <Input
              {...field("year")}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          <Field id="month" label="Month, if known" error={errors.month}>
            <Input
              {...field("month")}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          <Field id="day" label="Day, if known" error={errors.day}>
            <Input
              {...field("day")}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-dim">A year alone is fine.</p>
      </fieldset>

      {(type === "book" || type === "comic") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="form" label="Form" error={errors.form}>
            <select {...field("form")} className={selectClass}>
              <option value="">Pick one</option>
              {forms.map((f) => (
                <option key={f} value={f}>
                  {capital(f)}
                </option>
              ))}
            </select>
          </Field>
          {type === "book" && (
            <Field id="author" label="Author" error={errors.author}>
              <Input {...field("author")} className={inputClass} />
            </Field>
          )}
          {type === "comic" && (
            <Field id="number" label="Number" error={errors.number}>
              <Input
                {...field("number")}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          )}
        </div>
      )}
      {type === "comic" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="series" label="Series" error={errors.series}>
            <Input {...field("series")} className={inputClass} />
          </Field>
          <Field
            id="seriesKind"
            label="Kind of series"
            error={errors.seriesKind}
          >
            <select {...field("seriesKind")} className={selectClass}>
              <option value="">Not sure</option>
              {seriesKinds.map((k) => (
                <option key={k} value={k}>
                  {capital(k)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {type === "film" && (
        <Field
          id="runtimeMinutes"
          label="Runtime, in minutes"
          error={errors.runtimeMinutes}
        >
          <Input
            {...field("runtimeMinutes")}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
      )}
      {type === "tv" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="seasons" label="Seasons" error={errors.seasons}>
            <Input
              {...field("seasons")}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
          <Field id="episodes" label="Episodes" error={errors.episodes}>
            <Input
              {...field("episodes")}
              inputMode="numeric"
              className={inputClass}
            />
          </Field>
        </div>
      )}

      <Field
        id="summary"
        label={
          <>
            Summary <span className="font-normal text-dim">optional</span>
          </>
        }
        error={errors.summary}
      >
        <Textarea
          {...field("summary")}
          placeholder="A line or two, in your words."
          className="min-h-28 rounded-[10px] bg-background px-3 py-2.5"
        />
      </Field>

      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't add it just now. Try again.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-11 px-5"
        >
          Add to catalog
        </Button>
        <span className="ml-auto text-xs text-dim">
          Added as a manual entry, by you. Anyone on this nook can find it.
        </span>
      </div>
    </form>
  );
}
