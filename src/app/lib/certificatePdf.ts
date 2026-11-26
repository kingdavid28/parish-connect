import { jsPDF } from "jspdf";
import type { ParishBranding } from "../config";
import { proxyImageUrl } from "./imageProxy";

export type CertificateType = "baptism" | "confirmation" | "marriage" | "death";

type FieldValue = string | number | null;
type MaybeField = FieldValue | undefined;

export type CertificateTemplate = "classic" | "elegant" | "minimal" | "traditional" | "modern";

export const CERTIFICATE_TEMPLATES: Readonly<{ id: CertificateTemplate; name: string; blurb: string }[]> = [
  { id: "classic", name: "Classic Blue", blurb: "Double navy border, serif type — the standard parish look" },
  { id: "elegant", name: "Elegant Gold", blurb: "Thin gold frame with refined spacing" },
  { id: "minimal", name: "Minimal", blurb: "Clean sans-serif, no border — modern and understated" },
  { id: "traditional", name: "Traditional", blurb: "Deep maroon accents, formal serif, framed" },
  { id: "modern", name: "Modern Banner", blurb: "Colored header band with bold type" },
];

interface TStyle {
  accent: [number, number, number];
  font: "times" | "helvetica";
  border: "double" | "single" | "none";
  /** Filled accent band behind the parish name. */
  band: boolean;
  align: "center" | "left";
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function styles(parish: ParishBranding): Record<CertificateTemplate, TStyle> {
  const parishAccent = hexToRgb(parish.accentColor || "") || [37, 99, 235];
  return {
    classic: { accent: [37, 99, 235], font: "times", border: "double", band: false, align: "center" },
    elegant: { accent: [146, 112, 34], font: "times", border: "single", band: false, align: "center" },
    minimal: { accent: [51, 65, 85], font: "helvetica", border: "none", band: false, align: "left" },
    traditional: { accent: [127, 29, 29], font: "times", border: "double", band: false, align: "center" },
    modern: { accent: parishAccent, font: "helvetica", border: "single", band: true, align: "center" },
  };
}

export interface CertificateRecord {
  id?: string;
  // sacramental_records / baptism
  name?: FieldValue;
  birthday?: FieldValue;
  parents_name?: FieldValue;
  baptized_by?: FieldValue;
  canonical_book?: FieldValue;
  baptismal_date?: FieldValue;
  godparents_name?: FieldValue;
  confirmed_by?: FieldValue;
  confirmbook_no?: FieldValue;
  confirmed_date?: FieldValue;
  confirm_sponsor?: FieldValue;
  // baptism_records
  full_name?: FieldValue;
  baptism_date?: FieldValue;
  birth_date?: FieldValue;
  father_name?: FieldValue;
  mother_name?: FieldValue;
  godfather_name?: FieldValue;
  godmother_name?: FieldValue;
  // marriage_records
  groom_name?: FieldValue;
  bride_name?: FieldValue;
  marriage_date?: FieldValue;
  groom_father_name?: FieldValue;
  groom_mother_name?: FieldValue;
  bride_father_name?: FieldValue;
  bride_mother_name?: FieldValue;
  sponsors_names?: FieldValue;
  contract_no?: FieldValue;
  // death_records
  death_date?: FieldValue;
  age?: number | string | null;
  residence?: FieldValue;
  spouse_name?: FieldValue;
  informant_name?: FieldValue;
  cause_of_death?: FieldValue;
  cemetery?: FieldValue;
  // shared
  priest?: FieldValue;
  location?: FieldValue;
  record_number?: FieldValue;
}

const PW = 210; // A4 width mm
const CX = PW / 2;

function fmtDate(v: MaybeField): string {
  if (!v) return "_______________";
  const d = new Date(String(v).includes("T") ? v : String(v).replace(/ /, "T"));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function value(v: MaybeField): string {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? "_______________" : s;
}

function border(doc: jsPDF, s: TStyle) {
  if (s.border === "none") return;
  doc.setDrawColor(...s.accent);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, PW - 24, 273);
  if (s.border === "double") {
    doc.setLineWidth(0.25);
    doc.rect(15, 15, PW - 30, 267);
  }
}

function letterhead(doc: jsPDF, parish: ParishBranding, s: TStyle, logo: HTMLImageElement | null) {
  const bandH = 34;
  if (s.band) {
    doc.setFillColor(...s.accent);
    doc.rect(15, 15, PW - 30, bandH, "F");
  }
  const hasLogo = logo !== null;
  const nameY = hasLogo ? 48 : 32;
  if (s.band) {
    // Logo sits at the left edge of the band so it can't overlap the
    // centered parish name/tagline text.
    if (hasLogo) {
      doc.addImage(logo, "PNG", 21, 21, 22, 22);
    }
    doc.setFont(s.font, "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(parish.name, CX + (hasLogo ? 8 : 0), 30, { align: "center", maxWidth: 140 });
    doc.setFont(s.font, "normal");
    doc.setFontSize(10);
    const sub = [parish.address || parish.location, parish.tagline].filter(Boolean).join(" · ");
    if (sub) doc.text(sub, CX + (hasLogo ? 8 : 0), 38, { align: "center", maxWidth: 140 });
    return;
  }
  if (hasLogo) {
    const size = 18;
    doc.addImage(logo, "PNG", CX - size / 2, 20, size, size);
  }
  doc.setFont(s.font, "bold");
  doc.setFontSize(20);
  doc.setTextColor(...s.accent);
  doc.text(parish.name, CX, nameY, { align: "center" });
  doc.setFont(s.font, "normal");
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);
  const sub = [parish.address || parish.location, parish.tagline].filter(Boolean).join(" · ");
  if (sub) doc.text(sub, CX, nameY + 7, { align: "center" });
  doc.setDrawColor(...s.accent);
  doc.setLineWidth(0.6);
  const ruleY = nameY + 12;
  doc.line(40, ruleY, PW - 40, ruleY);
}

function certTitle(doc: jsPDF, title: string, s: TStyle) {
  doc.setFont(s.font, "bold");
  doc.setFontSize(24);
  doc.setTextColor(17, 24, 39);
  doc.text(title.toUpperCase(), CX, 80, { align: "center" });
  doc.setFont(s.font, "italic");
  doc.setFontSize(12);
  doc.setTextColor(75, 85, 99);
  doc.text("This is to certify that", CX, 96, { align: "center" });
}

function nameLine(doc: jsPDF, name: string, y: number, s: TStyle) {
  doc.setFont(s.font, "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39);
  doc.text(name.toUpperCase(), CX, y, { align: "center", maxWidth: 170 });
  doc.setLineWidth(0.4);
  doc.line(45, y + 2.5, PW - 45, y + 2.5);
}

function body(doc: jsPDF, lines: string[], startY: number, s: TStyle): number {
  doc.setFont(s.font, "normal");
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  const centered = s.align === "center";
  let y = startY;
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, 160) as string[];
    const opts = centered ? { align: "center" as const } : undefined;
    for (const w of wrapped) {
      doc.text(w, centered ? CX : 30, y, opts);
      y += 7;
    }
    y += 1.5;
  }
  return y;
}

function issuedBlock(doc: jsPDF, y: number, parish: ParishBranding, s: TStyle, recordNo?: FieldValue) {
  const today = new Date();
  const day = today.toLocaleDateString("en-PH", { day: "numeric" });
  const monthYear = today.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const place = parish.location ? `, ${parish.location}` : "";
  doc.setFont(s.font, "italic");
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  doc.text(`Given this ${day} day of ${monthYear} at ${parish.name}${place}.`, CX, y, { align: "center", maxWidth: 160 });
  if (recordNo) {
    doc.setFont(s.font, "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Registry No.: ${recordNo}`, CX, y + 16, { align: "center" });
  }
}

function signature(doc: jsPDF, priestName: MaybeField, s: TStyle, label = "Parish Priest") {
  const sigY = 258;
  doc.setLineWidth(0.4);
  doc.setDrawColor(31, 41, 55);
  doc.line(60, sigY, 150, sigY);
  doc.setFont(s.font, "bold");
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text(value(priestName), CX, sigY + 6, { align: "center" });
  doc.setFont(s.font, "normal");
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

function joinNames(...names: MaybeField[]): string {
  return names.map((n) => (n == null ? "" : String(n)).trim()).filter(Boolean).join(" and ");
}

interface CertSection {
  subject: string;
  title: string;
  /** Names rendered on the ruled line(s); "and" is printed between entries. */
  names: string[];
  /** Y where the narrative body starts. */
  bodyY: number;
  lines: string[];
  registryNo: FieldValue;
  priest: FieldValue;
}

function baptismSection(r: CertificateRecord, parish: ParishBranding): CertSection {
  const person = value(r.name || r.full_name);
  const parents = r.parents_name || joinNames(r.father_name, r.mother_name);
  const sponsors = r.godparents_name || joinNames(r.godfather_name, r.godmother_name);
  return {
    subject: person,
    title: "Certificate of Baptism",
    names: [person],
    bodyY: 122,
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
    bodyY: 122,
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
    bodyY: 142,
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
    bodyY: 122,
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

/** Load the parish logo for embedding; null on any failure (PDF still renders). */
function loadLogo(parish: ParishBranding): Promise<HTMLImageElement | null> {
  const url = proxyImageUrl(parish.logoUrl);
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 8000);
  });
}

/** Renders a single-page A4 certificate PDF in the chosen template and downloads it. */
export async function buildCertificatePdf(
  type: CertificateType,
  record: CertificateRecord,
  parish: ParishBranding,
  template: CertificateTemplate = "classic"
): Promise<void> {
  const s = SECTIONS[type](record, parish);
  const style = styles(parish)[template];
  const logo = await loadLogo(parish);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  border(doc, style);
  letterhead(doc, parish, style, logo);
  certTitle(doc, s.title, style);

  s.names.forEach((name, i) => {
    const y = 110 + i * 20;
    nameLine(doc, name, y, style);
    if (i < s.names.length - 1) {
      doc.setFont(style.font, "italic");
      doc.setFontSize(14);
      doc.setTextColor(75, 85, 99);
      doc.text("and", CX, y + 10, { align: "center" });
    }
  });
  body(doc, s.lines, s.bodyY, style);

  issuedBlock(doc, 226, parish, style, s.registryNo);
  signature(doc, s.priest, style);
  sealNote(doc);

  const fileSafe = s.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "record";
  doc.save(`${type}-certificate-${fileSafe}.pdf`);
}
