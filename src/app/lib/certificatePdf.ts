import { jsPDF } from "jspdf";
import type { ParishBranding } from "../config";

export type CertificateType = "baptism" | "confirmation" | "marriage" | "death";

export interface CertificateRecord {
  // sacramental_records / baptism
  name?: string | null;
  birthday?: string | null;
  parents_name?: string | null;
  baptized_by?: string | null;
  canonical_book?: string | null;
  baptismal_date?: string | null;
  godparents_name?: string | null;
  confirmed_by?: string | null;
  confirmbook_no?: string | null;
  confirmed_date?: string | null;
  confirm_sponsor?: string | null;
  // baptism_records
  full_name?: string | null;
  baptism_date?: string | null;
  birth_date?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  godfather_name?: string | null;
  godmother_name?: string | null;
  // marriage_records
  groom_name?: string | null;
  bride_name?: string | null;
  marriage_date?: string | null;
  groom_father_name?: string | null;
  groom_mother_name?: string | null;
  bride_father_name?: string | null;
  bride_mother_name?: string | null;
  sponsors_names?: string | null;
  contract_no?: string | null;
  // death_records
  death_date?: string | null;
  age?: number | string | null;
  residence?: string | null;
  spouse_name?: string | null;
  informant_name?: string | null;
  cause_of_death?: string | null;
  cemetery?: string | null;
  // shared
  priest?: string | null;
  location?: string | null;
  record_number?: string | null;
}

const PW = 210; // A4 width mm
const CX = PW / 2;

function fmtDate(v: string | null | undefined): string {
  if (!v) return "_______________";
  const d = new Date(String(v).includes("T") ? v : String(v).replace(/ /, "T"));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function value(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? "_______________" : s;
}

function border(doc: jsPDF) {
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, PW - 24, 273);
  doc.setLineWidth(0.25);
  doc.rect(15, 15, PW - 30, 267);
}

function letterhead(doc: jsPDF, parish: ParishBranding) {
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 64, 175);
  doc.text(parish.name, CX, 32, { align: "center" });
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);
  const sub = [parish.address || parish.location, parish.tagline].filter(Boolean).join(" · ");
  if (sub) doc.text(sub, CX, 39, { align: "center" });
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.6);
  doc.line(40, 44, PW - 40, 44);
}

function certTitle(doc: jsPDF, title: string) {
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.setTextColor(17, 24, 39);
  doc.text(title.toUpperCase(), CX, 60, { align: "center" });
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.setTextColor(75, 85, 99);
  doc.text("This is to certify that", CX, 76, { align: "center" });
}

function nameLine(doc: jsPDF, name: string, y: number) {
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39);
  doc.text(name.toUpperCase(), CX, y, { align: "center", maxWidth: 170 });
  doc.setLineWidth(0.4);
  doc.line(45, y + 2.5, PW - 45, y + 2.5);
}

function body(doc: jsPDF, lines: string[], startY: number): number {
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  let y = startY;
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, 160) as string[];
    for (const w of wrapped) {
      doc.text(w, CX, y, { align: "center" });
      y += 7;
    }
    y += 1.5;
  }
  return y;
}

function issuedBlock(doc: jsPDF, y: number, parish: ParishBranding, recordNo?: string | null) {
  const today = new Date();
  const day = today.toLocaleDateString("en-PH", { day: "numeric" });
  const monthYear = today.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  doc.text(
    `Given this ${day} day of ${monthYear} at ${parish.name}${parish.location ? `, ${parish.location}` : ""}.`,
    CX, y, { align: "center", maxWidth: 160 }
  );
  if (recordNo) {
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Registry No.: ${recordNo}`, CX, y + 16, { align: "center" });
  }
}

function signature(doc: jsPDF, priestName?: string | null, label = "Parish Priest") {
  const sigY = 258;
  doc.setLineWidth(0.4);
  doc.setDrawColor(31, 41, 55);
  doc.line(60, sigY, 150, sigY);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text(value(priestName), CX, sigY + 6, { align: "center" });
  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);
  doc.text(label, CX, sigY + 11, { align: "center" });
}

function sealNote(doc: jsPDF) {
  doc.setFont("times", "italic");
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);
  doc.text("Not valid without the parish seal.", CX, 275, { align: "center" });
}

function joinNames(...names: Array<string | null | undefined>): string {
  return names.map((n) => (n || "").trim()).filter(Boolean).join(" and ");
}

/** Renders a single-page A4 certificate PDF and triggers a download. */
export function buildCertificatePdf(
  type: CertificateType,
  record: CertificateRecord,
  parish: ParishBranding
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  border(doc);
  letterhead(doc, parish);
  let subject = "";

  if (type === "baptism") {
    const person = value(record.name || record.full_name);
    subject = person;
    certTitle(doc, "Certificate of Baptism");
    nameLine(doc, person, 92);
    body(doc, [
      `born on the ${fmtDate(record.birthday || record.birth_date)}`,
      `child of ${joinNames(record.parents_name || record.father_name, record.parents_name ? null : record.mother_name) || "_______________"}`,
      `was solemnly baptized according to the rites of the Roman Catholic Church`,
      `on the ${fmtDate(record.baptismal_date || record.baptism_date)}`,
      `at ${value(record.location || parish.name)}`,
      `by ${value(record.baptized_by || record.priest)}`,
      `with sponsors ${joinNames(record.godparents_name || record.godfather_name, record.godparents_name ? null : record.godmother_name) || "_______________"}`,
      `as recorded in ${value(record.canonical_book)} of this parish.`,
    ], 108);
  } else if (type === "confirmation") {
    const person = value(record.name);
    subject = person;
    certTitle(doc, "Certificate of Confirmation");
    nameLine(doc, person, 92);
    body(doc, [
      `child of ${value(record.parents_name)}`,
      `was confirmed according to the rites of the Roman Catholic Church`,
      `on the ${fmtDate(record.confirmed_date)}`,
      `at ${parish.name}`,
      `by ${value(record.confirmed_by)}`,
      `with sponsor ${value(record.confirm_sponsor)}`,
      `as recorded in Confirmation Book ${value(record.confirmbook_no)} of this parish.`,
    ], 108);
  } else if (type === "marriage") {
    subject = `${value(record.groom_name)} & ${value(record.bride_name)}`;
    certTitle(doc, "Certificate of Marriage");
    nameLine(doc, value(record.groom_name), 92);
    doc.setFont("times", "italic");
    doc.setFontSize(14);
    doc.setTextColor(75, 85, 99);
    doc.text("and", CX, 102, { align: "center" });
    nameLine(doc, value(record.bride_name), 112);
    body(doc, [
      `were joined together in the Sacrament of Holy Matrimony`,
      `on the ${fmtDate(record.marriage_date)}`,
      `at ${value(record.location || parish.name)}`,
      `solemnized by ${value(record.priest)}`,
      `in the presence of witnesses ${value(record.sponsors_names)}`,
      `as recorded in Registry No. ${value(record.record_number)}` +
        (record.contract_no ? ` under Marriage Contract No. ${record.contract_no}` : "") +
        ` of this parish.`,
    ], 126);
  } else {
    const person = value(record.full_name || record.name);
    subject = person;
    certTitle(doc, "Certificate of Death");
    nameLine(doc, person, 92);
    const details = [
      record.birth_date ? `born on the ${fmtDate(record.birth_date)}` : null,
      record.age ? `aged ${record.age}` : null,
      record.residence ? `of ${record.residence}` : null,
      record.spouse_name ? `survived by spouse ${record.spouse_name}` : null,
    ].filter(Boolean) as string[];
    body(doc, [
      details.length ? details.join(", ") : "",
      `died on the ${fmtDate(record.death_date)}`,
      record.cause_of_death ? `of ${record.cause_of_death}` : "",
      `and was laid to rest at ${value(record.cemetery)}`,
      `as recorded in Registry No. ${value(record.record_number)} of this parish.`,
      record.informant_name ? `As reported by ${record.informant_name}.` : "",
    ].filter(Boolean), 108);
  }

  issuedBlock(doc, 226, parish, type === "baptism" ? record.record_number : type === "confirmation" ? record.confirmbook_no : record.record_number);
  signature(doc, record.priest || record.baptized_by || record.confirmed_by);
  sealNote(doc);

  const fileSafe = subject.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "record";
  doc.save(`${type}-certificate-${fileSafe}.pdf`);
}
