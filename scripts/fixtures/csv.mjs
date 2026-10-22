/**
 * Reads CSV text into records of string fields, per RFC 4180, plus two rules
 * of our own. CRLF becomes LF over the whole text before parsing, quoted
 * fields included, so a field's bytes don't depend on whose checkout ran the
 * build. An empty line outside quotes is an empty record `[]`, so a caller
 * can find a blank separator between sections of an export.
 */
export function parseCsv(input) {
  const text = input.replaceAll("\r\n", "\n");
  const records = [];
  let record = [];
  let field = "";
  // start: nothing read for this field yet; plain: unquoted field;
  // quoted: inside quotes; closed: just past a closing quote.
  let state = "start";
  let emptyLine = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        state = "closed";
      }
      continue;
    }
    if (char === ",") {
      record.push(field);
      field = "";
      state = "start";
      emptyLine = false;
    } else if (char === "\n") {
      if (!emptyLine) record.push(field);
      records.push(record);
      record = [];
      field = "";
      state = "start";
      emptyLine = true;
    } else if (state === "closed") {
      throw new Error(
        `CSV: ${JSON.stringify(char)} after a closing quote at character ${i}`,
      );
    } else if (char === '"' && state === "start") {
      state = "quoted";
      emptyLine = false;
    } else {
      field += char;
      state = "plain";
      emptyLine = false;
    }
  }

  if (state === "quoted") {
    throw new Error("CSV: a quoted field is never closed");
  }
  if (!emptyLine) {
    record.push(field);
    records.push(record);
  }
  return records;
}
