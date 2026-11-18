import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const peso = (n: number) =>
  `PHP ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export interface AdminReportData {
  year: number;
  month?: number | null;
  totals: {
    confirmed_total: number;
    confirmed_count: number;
    pending_count: number;
    rejected_count: number;
    voided_count: number;
    donors_paying: number;
    active_donors: number;
    expected_monthly: number;
  };
  monthly: { month: number; total: number; count: number; donors: number }[];
  becs: { bec_name: string; donors: number; count: number; total: number }[];
  top_donors: { name: string; bec_name: string; total: number; count: number }[];
  contributions?: { name: string; bec_name: string; total: number; count: number }[];
  payments?: {
    id: string;
    donor_name: string;
    bec_name: string;
    amount: number;
    method: string;
    reference: string | null;
    receipt_no: string | null;
    status: string;
    created_at: string;
    recorded_by_name: string | null;
  }[];
  daily?: { day: string; total: number; count: number }[];
}

function header(doc: jsPDF, parishName: string, title: string, subtitle: string) {
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text(parishName, 14, 16);
  doc.setFontSize(13);
  doc.setTextColor(31, 41, 55);
  doc.text(title, 14, 24);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(subtitle, 14, 30);
  doc.setDrawColor(229, 231, 235);
  doc.line(14, 33, 196, 33);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(`Page ${i} of ${pages}`, 196, 290, { align: "right" });
    doc.text(`Generated ${new Date().toLocaleString("en-PH")} · Parish Connect`, 14, 290);
  }
}

/** Admin: annual Balik Pasalamat financial report PDF. */
export function buildAdminReportPdf(report: AdminReportData, parishName: string) {
  const doc = new jsPDF();
  const { totals } = report;
  const expectedAnnual = totals.expected_monthly * 12;
  const rate = expectedAnnual > 0 ? (totals.confirmed_total / expectedAnnual) * 100 : 0;

  header(doc, parishName, `Balik Pasalamat sa Diyos — Financial Report ${report.year}`,
    `Generated ${new Date().toLocaleString("en-PH")}`);

  // Summary cards as a key-value table
  autoTable(doc, {
    startY: 38,
    head: [["Summary", "Amount / Count"]],
    body: [
      ["Total collected (confirmed)", peso(totals.confirmed_total)],
      ["Confirmed payments", String(totals.confirmed_count)],
      ["Donors who paid", `${totals.donors_paying} of ${totals.active_donors}`],
      ["Expected annual dues", peso(expectedAnnual)],
      ["Collection rate", `${rate.toFixed(1)}%`],
      ["Pending / Rejected / Voided",
        `${totals.pending_count} / ${totals.rejected_count} / ${totals.voided_count}`],
    ],
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 1: { halign: "right" } },
  });

  const monthlyRows = MONTHS_FULL.map((name, i) => {
    const row = report.monthly.find((m) => m.month === i + 1);
    return [name, row ? peso(row.total) : "—", row ? String(row.count) : "—", row ? String(row.donors) : "—"];
  });

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60,
    margin: { top: 12 },
    head: [["Month", "Collected", "Payments", "Donors"]],
    body: monthlyRows,
    theme: "striped",
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    foot: [["Total", peso(totals.confirmed_total), String(totals.confirmed_count), ""]],
    footStyles: { fontStyle: "bold", fillColor: [239, 246, 255], textColor: [31, 41, 55] },
  });

  let y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text("Collections by BEC Community", 14, y + 10);
  autoTable(doc, {
    startY: y + 14,
    head: [["BEC", "Donors", "Payments", "Collected"]],
    body: report.becs.map((b) => [b.bec_name, String(b.donors), String(b.count), peso(b.total)]),
    theme: "striped",
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });

  if (report.top_donors.length) {
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    doc.setFontSize(11);
    doc.text("Top Contributors", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["#", "Donor", "BEC", "Payments", "Total"]],
      body: report.top_donors.map((d, i) => [String(i + 1), d.name, d.bec_name, String(d.count), peso(d.total)]),
      theme: "striped",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 0: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
  }

  footer(doc);
  doc.save(`balik-pasalamat-report-${report.year}.pdf`);
}

/** Admin: monthly Balik Pasalamat financial report PDF. */
export function buildAdminMonthlyReportPdf(report: AdminReportData, parishName: string) {
  const doc = new jsPDF();
  const { totals } = report;
  const month = report.month ?? 1;
  const monthName = MONTHS_FULL[month - 1];
  const rate = totals.expected_monthly > 0 ? (totals.confirmed_total / totals.expected_monthly) * 100 : 0;

  header(doc, parishName,
    `Balik Pasalamat sa Diyos — Monthly Report ${monthName} ${report.year}`,
    `Generated ${new Date().toLocaleString("en-PH")}`);

  autoTable(doc, {
    startY: 38,
    head: [["Summary", "Amount / Count"]],
    body: [
      ["Total collected (confirmed)", peso(totals.confirmed_total)],
      ["Confirmed payments", String(totals.confirmed_count)],
      ["Donors who paid", `${totals.donors_paying} of ${totals.active_donors}`],
      ["Expected monthly dues", peso(totals.expected_monthly)],
      ["Collection rate", `${rate.toFixed(1)}%`],
      ["Pending / Rejected / Voided",
        `${totals.pending_count} / ${totals.rejected_count} / ${totals.voided_count}`],
    ],
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 1: { halign: "right" } },
  });

  if (report.daily?.length) {
    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60,
      head: [["Date", "Collected", "Payments"]],
      body: report.daily.map((d) => [
        new Date(`${d.day}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
        peso(d.total),
        String(d.count),
      ]),
      theme: "striped",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      foot: [["Total", peso(totals.confirmed_total), String(totals.confirmed_count)]],
      footStyles: { fontStyle: "bold", fillColor: [239, 246, 255], textColor: [31, 41, 55] },
    });
  }

  let y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  if (report.contributions?.length) {
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);
    doc.text("Contributions by Donor", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["Donor", "BEC", "Payments", "Total"]],
      body: report.contributions.map((d) => [d.name, d.bec_name, String(d.count), peso(d.total)]),
      theme: "striped",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  }

  if (report.payments?.length) {
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);
    doc.text("Transaction Ledger", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["Date", "Donor", "Method", "Receipt / Ref", "Status", "Amount"]],
      body: report.payments.map((p) => [
        new Date(p.created_at).toLocaleDateString("en-PH"),
        p.donor_name,
        p.method,
        p.receipt_no ?? p.reference ?? "—",
        p.status,
        peso(p.amount),
      ]),
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 5: { halign: "right" } },
    });
  }

  footer(doc);
  doc.save(`balik-pasalamat-report-${report.year}-${String(month).padStart(2, "0")}.pdf`);
}

export interface UserLedgerData {
  donor: { id: string; name: string; bec_name: string | null } | null;
  year: number;
  expected: number;
  months: {
    month: number;
    expected: number;
    paid_total: number;
    balance: number;
    status: "unpaid" | "partial" | "paid";
    payments: { amount: number; method: string; status: string; created_at: string; reference: string | null }[];
  }[];
  annual_expected: number;
  annual_paid: number;
  net_balance: number;
  total_pending: number;
}

/** Member: personal Balik Pasalamat statement PDF. */
export function buildMemberStatementPdf(ledger: UserLedgerData, parishName: string) {
  const doc = new jsPDF();
  const donorName = ledger.donor?.name ?? "Parishioner";
  const bec = ledger.donor?.bec_name ?? "—";

  header(doc, parishName, `Balik Pasalamat sa Diyos — Contribution Statement ${ledger.year}`,
    `${donorName} · ${bec} · Generated ${new Date().toLocaleString("en-PH")}`);

  autoTable(doc, {
    startY: 38,
    head: [["Summary", "Amount"]],
    body: [
      ["Expected annual dues", peso(ledger.annual_expected)],
      ["Total confirmed contributions", peso(ledger.annual_paid)],
      ["Remaining balance", peso(ledger.net_balance)],
      ["Awaiting approval", peso(ledger.total_pending)],
    ],
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 1: { halign: "right" } },
  });

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60,
    head: [["Month", "Expected", "Paid", "Balance", "Status"]],
    body: ledger.months.map((m) => [
      MONTHS_FULL[m.month - 1],
      m.expected > 0 ? peso(m.expected) : "—",
      m.paid_total > 0 ? peso(m.paid_total) : "—",
      m.balance > 0 ? peso(m.balance) : "—",
      m.status === "paid" ? "Complete" : m.status === "partial" ? "Partial" : "Not yet",
    ]),
    theme: "striped",
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });

  const confirmed = ledger.months.flatMap((m) =>
    m.payments
      .filter((p) => p.status === "confirmed")
      .map((p) => ({
        ...p,
        monthName: MONTHS_FULL[m.month - 1],
      }))
  );
  if (confirmed.length) {
    const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);
    doc.text("Payment History", 14, y + 10);
    autoTable(doc, {
      startY: y + 14,
      head: [["Month", "Date", "Method", "Reference", "Amount"]],
      body: confirmed.map((p) => [
        p.monthName,
        new Date(p.created_at).toLocaleDateString("en-PH"),
        p.method,
        p.reference ?? "—",
        peso(p.amount),
      ]),
      theme: "striped",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 4: { halign: "right" } },
    });
  }

  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(
    "Thank you for your faithful giving. This statement is for personal record-keeping.",
    14, 284,
  );

  footer(doc);
  const safe = donorName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`balik-pasalamat-statement-${ledger.year}-${safe}.pdf`);
}
