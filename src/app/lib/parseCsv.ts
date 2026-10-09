/**
 * Minimal RFC-4180 CSV parser + header mapping for sacramental-record imports.
 * Handles quoted fields, escaped "" quotes, commas/CRLF inside quotes.
 * No dependency — parish registries contain names like "Dela Cruz, Juan"
 * so a naive split(',') is not sufficient.
 */

export interface ParsedCsvRow {
  /** 1-based line number in the source file (header = 1). */
  row: number;
  data: Record<string, string>;
}

export interface CsvParseResult {
  headers: string[];
  rows: ParsedCsvRow[];
  errors: { row: number; message: string }[];
}

/** Split CSV text into a grid of string cells. */
export function parseCsvGrid(text: string): { grid: string[][]; errors: { row: number; message: string }[] } {
  const grid: string[][] = [];
  const errors: { row: number; message: string }[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let lineNo = 1;
  let fieldStartedInQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
    fieldStartedInQuotes = false;
  };
  const pushRow = () => {
    pushField();
    grid.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      fieldStartedInQuotes = field === "";
      if (!fieldStartedInQuotes) {
        errors.push({ row: lineNo, message: `Unexpected quote in field ${row.length + 1}` });
      }
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
      lineNo++;
    } else if (ch === "\r") {
      // swallow; \n follows in CRLF files, lone \r treated as newline
      if (text[i + 1] !== "\n") {
        pushRow();
        lineNo++;
      }
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    errors.push({ row: lineNo, message: "Unterminated quoted field" });
  }
  // Trailing row (non-empty or file didn't end with newline)
  if (field !== "" || row.length > 0) {
    pushRow();
  }
  // Drop fully-empty trailing lines
  while (grid.length && grid[grid.length - 1].every((c) => c.trim() === "")) {
    grid.pop();
  }
  return { grid, errors };
}

/** Canonical sacramental-record fields (matches RECORD_FIELDS server-side). */
export const RECORD_FIELDS = [
  "name", "birthday", "parents_name", "baptized_by", "canonical_book",
  "baptismal_date", "godparents_name", "confirmed_by", "confirmbook_no",
  "confirmed_date", "confirm_sponsor",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  name: "name", fullname: "name", childname: "name",
  birthday: "birthday", birthdate: "birthday", dateofbirth: "birthday", dob: "birthday",
  parentsname: "parents_name", parentsnames: "parents_name", parents: "parents_name", parentnames: "parents_name",
  baptizedby: "baptized_by", baptized: "baptized_by",
  canonicalbook: "canonical_book", book: "canonical_book", bookno: "canonical_book", booknumber: "canonical_book", baptismbook: "canonical_book",
  baptismaldate: "baptismal_date", baptismdate: "baptismal_date", dateofbaptism: "baptismal_date",
  godparentsname: "godparents_name", godparents: "godparents_name", godparentsnames: "godparents_name", ninongninang: "godparents_name",
  confirmedby: "confirmed_by",
  confirmbookno: "confirmbook_no", confirmationbook: "confirmbook_no", confirmationbookno: "confirmbook_no", confirmationbooknumber: "confirmbook_no",
  confirmeddate: "confirmed_date", confirmationdate: "confirmed_date", dateofconfirmation: "confirmed_date",
  confirmsponsor: "confirm_sponsor", confirmationsponsor: "confirm_sponsor", sponsor: "confirm_sponsor",
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Parse CSV text with a header row into canonical record objects.
 * Rows failing structural validation surface in `errors` with their line number.
 */
export function parseRecordsCsv(text: string): CsvParseResult {
  const { grid, errors } = parseCsvGrid(text);
  if (grid.length === 0) {
    return { headers: [], rows: [], errors: [{ row: 1, message: "CSV is empty" }] };
  }

  const rawHeaders = grid[0];
  const headers = rawHeaders.map((h) => HEADER_ALIASES[normalizeHeader(h)] || "");
  if (!headers.includes("name")) {
    return {
      headers: rawHeaders,
      rows: [],
      errors: [...errors, { row: 1, message: 'Missing required "name" column in header row' }],
    };
  }
  const unknown = rawHeaders.filter((h, i) => h.trim() && !headers[i]);
  unknown.forEach((h) =>
    errors.push({ row: 1, message: `Unrecognized column "${h}" — ignored` })
  );

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    if (cells.length > rawHeaders.length) {
      errors.push({ row: i + 1, message: `Row has ${cells.length} fields, expected ${rawHeaders.length} — check for stray commas` });
      continue;
    }
    const data: Record<string, string> = {};
    headers.forEach((field, j) => {
      if (field && cells[j] != null && cells[j].trim() !== "") {
        data[field] = cells[j].trim();
      }
    });
    if (!Object.keys(data).length) continue; // blank line
    if (!data.name) {
      errors.push({ row: i + 1, message: "Missing name — row skipped" });
      continue;
    }
    rows.push({ row: i + 1, data });
  }
  return { headers: rawHeaders, rows, errors };
}

/** CSV template header + example row for the Import dialog download. */
export const RECORDS_CSV_TEMPLATE =
  "name,birthday,parents_name,baptized_by,canonical_book,baptismal_date,godparents_name,confirmed_by,confirmbook_no,confirmed_date,confirm_sponsor\n" +
  '"Dela Cruz, Juan Miguel","2005-01-15","Dela Cruz, Pedro & Reyes, Maria","Fr. Santos","Book 12 p.34","2005-02-01","Cruz, Ana & Lim, Jose","Bishop García","Book 3 p.12","2018-05-10","Dela Cruz, Elena"\n';
