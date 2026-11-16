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
 * Generic header-mapped CSV parse. `aliases` maps normalized headers to
 * canonical fields; `required` fields must be present in the header and
 * non-empty in every row.
 */
export function parseCsvWithAliases(
  text: string,
  aliases: Record<string, string>,
  required: string[] = ["name"]
): CsvParseResult {
  const { grid, errors } = parseCsvGrid(text);
  if (grid.length === 0) {
    return { headers: [], rows: [], errors: [{ row: 1, message: "CSV is empty" }] };
  }

  const rawHeaders = grid[0];
  const headers = rawHeaders.map((h) => aliases[normalizeHeader(h)] || "");
  for (const field of required) {
    if (!headers.includes(field)) {
      return {
        headers: rawHeaders,
        rows: [],
        errors: [...errors, { row: 1, message: `Missing required "${field}" column in header row` }],
      };
    }
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
    const missing = required.find((f) => !data[f]);
    if (missing) {
      errors.push({ row: i + 1, message: `Missing ${missing} — row skipped` });
      continue;
    }
    rows.push({ row: i + 1, data });
  }
  return { headers: rawHeaders, rows, errors };
}

/**
 * Parse CSV text with a header row into canonical record objects.
 * Rows failing structural validation surface in `errors` with their line number.
 */
export function parseRecordsCsv(text: string): CsvParseResult {
  return parseCsvWithAliases(text, HEADER_ALIASES);
}

// ─── Donor import (BEC dues ledger) ──────────────────────────────────────────

const DONOR_ALIASES: Record<string, string> = {
  name: "name", fullname: "name", donor: "name", donorname: "name",
  address: "address", addr: "address",
  bec: "bec_name", becname: "bec_name", community: "bec_name",
  gcash: "gcash_number", gcashnumber: "gcash_number", gcashno: "gcash_number",
  expected: "expected_amount", expectedamount: "expected_amount",
  dues: "expected_amount", monthly: "expected_amount", monthlydues: "expected_amount",
};

export function parseDonorsCsv(text: string): CsvParseResult {
  return parseCsvWithAliases(text, DONOR_ALIASES);
}

export const DONORS_CSV_TEMPLATE =
  "name,address,bec,gcash,expected\n" +
  '"Dela Cruz, Juan","Purok 3, Kawayan","BEC St. Joseph","0917xxxxxxx","50"\n' +
  '"Santos, Maria","Brgy. Proper, Kawayan","BEC St. Joseph","0918xxxxxxx","50"\n';

/** CSV template header + example row for the Import dialog download. */
export const RECORDS_CSV_TEMPLATE =
  "name,birthday,parents_name,baptized_by,canonical_book,baptismal_date,godparents_name,confirmed_by,confirmbook_no,confirmed_date,confirm_sponsor\n" +
  '"Dela Cruz, Juan Miguel","2005-01-15","Dela Cruz, Pedro & Reyes, Maria","Fr. Santos","Book 12 p.34","2005-02-01","Cruz, Ana & Lim, Jose","Bishop García","Book 3 p.12","2018-05-10","Dela Cruz, Elena"\n';

// ─── Marriage / death registry import ─────────────────────────────────────────

const MARRIAGE_ALIASES: Record<string, string> = {
  groomname: "groom_name", groom: "groom_name", husband: "groom_name",
  bridename: "bride_name", bride: "bride_name", wife: "bride_name",
  marriagedate: "marriage_date", weddingdate: "marriage_date", dateofmarriage: "marriage_date", date: "marriage_date",
  groomfather: "groom_father_name", groomfathername: "groom_father_name",
  groommother: "groom_mother_name", groommothername: "groom_mother_name",
  bridefather: "bride_father_name", bridefathername: "bride_father_name",
  bridemother: "bride_mother_name", bridemothername: "bride_mother_name",
  sponsors: "sponsors_names", sponsorsnames: "sponsors_names", witnesses: "sponsors_names", ninongninang: "sponsors_names",
  priest: "priest", officiant: "priest", solemnizedby: "priest", minister: "priest",
  location: "location", place: "location", church: "location", venue: "location",
  recordnumber: "record_number", recordno: "record_number", registryno: "record_number", bookno: "record_number",
  contractno: "contract_no", contractnumber: "contract_no", marriagecontract: "contract_no", marriagecontractno: "contract_no", licenseno: "contract_no",
  notes: "notes", remarks: "notes",
};

export function parseMarriageCsv(text: string): CsvParseResult {
  return parseCsvWithAliases(text, MARRIAGE_ALIASES,
    ["groom_name", "bride_name", "marriage_date", "priest", "record_number"]);
}

const DEATH_ALIASES: Record<string, string> = {
  name: "full_name", fullname: "full_name", deceased: "full_name", deceasedname: "full_name",
  deathdate: "death_date", dateofdeath: "death_date", died: "death_date", date: "death_date",
  birthdate: "birth_date", birthday: "birth_date", dateofbirth: "birth_date", dob: "birth_date",
  age: "age",
  residence: "residence", address: "residence", addr: "residence",
  spousename: "spouse_name", spouse: "spouse_name",
  informantname: "informant_name", informant: "informant_name", nextofkin: "informant_name",
  causeofdeath: "cause_of_death", cause: "cause_of_death",
  cemetery: "cemetery", burialplace: "cemetery", burial: "cemetery", placeofburial: "cemetery",
  priest: "priest", officiant: "priest", minister: "priest",
  recordnumber: "record_number", recordno: "record_number", registryno: "record_number", bookno: "record_number",
  notes: "notes", remarks: "notes",
};

export function parseDeathCsv(text: string): CsvParseResult {
  return parseCsvWithAliases(text, DEATH_ALIASES, ["full_name", "death_date", "record_number"]);
}

export const MARRIAGE_CSV_TEMPLATE =
  "groom_name,bride_name,marriage_date,groom_father_name,groom_mother_name,bride_father_name,bride_mother_name,sponsors_names,priest,location,record_number,contract_no,notes\n" +
  '"Dela Cruz, Juan Miguel","Santos, Maria Clara","2015-06-20","Dela Cruz, Pedro","Reyes, Ana","Santos, Jose","Lim, Rosa","Garcia, Miguel & Torres, Elena","Fr. Santos","St. Raphael Church","MR-2015-012","LCRO-2015-1234",""\n';

export const DEATH_CSV_TEMPLATE =
  "full_name,death_date,birth_date,age,residence,spouse_name,informant_name,cause_of_death,cemetery,priest,record_number,notes\n" +
  '"Reyes, Juan Sr.","2020-03-14","1950-07-02","69","Purok 3, Kawayan","Reyes, Maria","Reyes, Jose Jr.","Natural causes","Kawayan Catholic Cemetery","Fr. Santos","DR-2020-045",""\n';
