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

function value(v: string | number | null | undefined): string {
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
  const place = parish.location ? `, ${parish.location}` : "";
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  doc.text(`Given this ${day} day of ${monthYear} at ${parish.name}${place}.`, CX, y, { align: "center", maxWidth: 160 });
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

interface CertSection {
  subject: string;
  title: string;
  /** Names rendered on the ruled line(s); "and" is printed between entries. */
  names: string[];
  /** Y where the narrative body starts. */
  bodyY: number;
  lines: string[];
  registryNo: string | null;
  priest: string | null;
}

function baptismSection(r: CertificateRecord, parish: ParishBranding): CertSection {
  const person = value(r.name || r.full_name);
  const parents = r.parents_name || joinNames(r.father_name, r.mother_name);
  const sponsors = r.godparents_name || joinNames(r.godfather_name, r.godmother_name);
  return {
    subject: person,
    title: "Certificate of Baptism",
    names: [person],
    bodyY: 108,
    lines: [
      `born on the ${fmtDate(r.birthday || r.birth_date)}`,
      `child of ${value(parents)}`,
      "was solemnly baptized according to the rites of the Roman Catholic Church",
      `on the ${fmtDate(r.baptismal_date || r.baptism_date)}`,
      `at ${value(r.location || parish.name)}`,
      `by ${value(r.baptized_by || r.priest)}`,
      `with sponsors ${value(sponsors)}`,
      `as recorded in ${value(r.canonical_book)} of this parish.`,
    ],
    registryNo: r.record_number || null,
    priest: r.baptized_by || r.priest || null,
  };
}

function confirmationSection(r: CertificateRecord, parish: ParishBranding): CertSection {
  const person = value(r.name);
  return {
    subject: person,
    title: "Certificate of Confirmation",
    names: [person],
    bodyY: 108,
    lines: [
      `child of ${value(r.parents_name)}`,
      "was confirmed according to the rites of the Roman Catholic Church",
      `on the ${fmtDate(r.confirmed_date)}`,
      `at ${parish.name}`,
      `by ${value(r.confirmed_by)}`,
      `with sponsor ${value(r.confirm_sponsor)}`,
      `as recorded in Confirmation Book ${value(r.confirmbook_no)} of this parish.`,
    ],
    registryNo: r.confirmbook_no || null,
    priest: r.confirmed_by || null,
  };
}

function marriageSection(r: CertificateRecord, parish: ParishBranding): CertSection {
  const contract = r.contract_no ? ` under Marriage Contract No. ${r.contract_no}` : "";
  return {
    subject: `${value(r.groom_name)} & ${value(r.bride_name)}`,
    title: "Certificate of Marriage",
    names: [value(r.groom_name), value(r.bride_name)],
    bodyY: 126,
    lines: [
      "were joined together in the Sacrament of Holy Matrimony",
      `on the ${fmtDate(r.marriage_date)}`,
      `at ${value(r.location || parish.name)}`,
      `solemnized by ${value(r.priest)}`,
      `in the presence of witnesses ${value(r.sponsors_names)}`,
      `as recorded in Registry No. ${value(r.record_number)}${contract} of this parish.`,
    ],
    registryNo: r.record_number || null,
    priest: r.priest || null,
  };
}

function deathSection(r: CertificateRecord): CertSection {
  const person = value(r.full_name || r.name);
  const details = [
    r.birth_date ? `born on the ${fmtDate(r.birth_date)}` : null,
    r.age ? `aged ${r.age}` : null,
    r.residence ? `of ${r.residence}` : null,
    r.spouse_name ? `survived by spouse ${r.spouse_name}` : null,
  ].filter((s): s is string => Boolean(s));
  const lines = [
    details.join(", "),
    `died on the ${fmtDate(r.death_date)}`,
    r.cause_of_death ? `of ${r.cause_of_death}` : null,
    `and was laid to rest at ${value(r.cemetery)}`,
    `as recorded in Registry No. ${value(r.record_number)} of this parish.`,
    r.informant_name ? `As reported by ${r.informant_name}.` : null,
  ].filter((s): s is string => Boolean(s));
  return {
    subject: person,
    title: "Certificate of Death",
    names: [person],
    bodyY: 108,
    lines,
    registryNo: r.record_number || null,
    priest: r.priest || null,
  };
}

const SECTIONS: Record<CertificateType, (r: CertificateRecord, p: ParishBranding) => CertSection> = {
  baptism: baptismSection,
  confirmation: confirmationSection,
  marriage: marriageSection,
  death: (r) => deathSection(r),
};

/** Renders a single-page A4 certificate PDF and triggers a download. */
export function buildCertificatePdf(
  type: CertificateType,
  record: CertificateRecord,
  parish: ParishBranding
) {
  const s = SECTIONS[type](record, parish);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  border(doc);
  letterhead(doc, parish);
  certTitle(doc, s.title);

  s.names.forEach((name, i) => {
    const y = 92 + i * 20;
    nameLine(doc, name, y);
    if (i < s.names.length - 1) {
      doc.setFont("times", "italic");
      doc.setFontSize(14);
      doc.setTextColor(75, 85, 99);
      doc.text("and", CX, y + 10, { align: "center" });
    }
  });
  body(doc, s.lines, s.bodyY);

  issuedBlock(doc, 226, parish, s.registryNo);
  signature(doc, s.priest);
  sealNote(doc);

  const fileSafe = s.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "record";
  doc.save(`${type}-certificate-${fileSafe}.pdf`);
}
