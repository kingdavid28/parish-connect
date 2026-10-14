import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Loader2, PhilippinePeso } from "lucide-react";
import { API } from "../config";

const MONTHS_FULL = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const getToken = () =>
  localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface Payment {
  id: string; month: number; amount: number; method: string;
  reference: string | null; receipt_url: string | null; created_at: string;
}
interface LedgerMonth {
  month: number; expected: number; paid_total: number; balance: number;
  status: "unpaid" | "partial" | "paid"; payments: Payment[];
}
interface MyLedger {
  donor: { id: string; name: string; bec_name: string | null } | null;
  year: number; expected: number; months: LedgerMonth[];
}

const peso = (n: number) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  unpaid: "bg-gray-100 text-gray-500",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "complete",
  partial: "partial",
  unpaid: "not yet",
};

export default function MyDues() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [ledger, setLedger] = useState<MyLedger | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/finance/my/ledger?year=${year}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setLedger(data.data);
    } catch { /* leave stale */ } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const totalPaid = ledger?.months.reduce((s, m) => s + m.paid_total, 0) || 0;
  const totalDue = ledger?.months
    .filter((m) => m.month <= now.getMonth() + 1 || year < now.getFullYear())
    .reduce((s, m) => s + m.expected, 0) || 0;
  const totalBalance = ledger?.months.reduce((s, m) => s + m.balance, 0) || 0;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PhilippinePeso className="h-5 w-5 text-primary" />
              My Contributions
            </CardTitle>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[95px] h-9" aria-label="Year"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !ledger?.donor ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-gray-600 font-medium">No contribution record is linked to your account yet.</p>
              <p className="text-sm text-gray-500">
                Ask a parish admin to link your account in the BEC Dues tab so you can track your monthly contributions here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                {ledger.donor.name}{ledger.donor.bec_name ? ` · ${ledger.donor.bec_name}` : ""}
                {ledger.expected > 0 && ` · suggested ${peso(ledger.expected)}/month`}
              </p>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Given ({year})</p>
                  <p className="text-lg font-semibold text-green-700">{peso(totalPaid)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Suggested</p>
                  <p className="text-lg font-semibold">{peso(totalDue)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">To go</p>
                  <p className={`text-lg font-semibold ${totalBalance > 0 ? "text-amber-600" : "text-green-700"}`}>
                    {peso(totalBalance)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {ledger.months.map((m) => (
                  <div key={m.month} className="border rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{MONTHS_FULL[m.month - 1]}</p>
                        <p className="text-xs text-gray-500">
                          {m.expected > 0 ? `suggested ${peso(m.expected)}` : "no suggested amount"}
                          {m.status !== "unpaid" && ` · given ${peso(m.paid_total)}`}
                          {m.status === "partial" && ` · ${peso(m.balance)} to go`}
                        </p>
                      </div>
                      <Badge className={`${STATUS_STYLE[m.status]} border-0`}>{STATUS_LABEL[m.status]}</Badge>
                    </div>
                    {m.payments.length > 0 && (
                      <div className="mt-2 space-y-1 border-t pt-2">
                        {m.payments.map((p) => (
                          <div key={p.id} className="flex justify-between text-sm">
                            <span className="text-gray-600 capitalize">
                              {p.method}{p.reference ? ` · ${p.reference}` : ""}
                            </span>
                            <span className="font-medium">{peso(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
