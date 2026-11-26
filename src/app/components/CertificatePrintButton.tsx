import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "./ui/dialog";
import { Printer, Loader } from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";
import { useParishConfig } from "../context/ParishConfigContext";
import {
  buildCertificatePdf, CERTIFICATE_TEMPLATES,
  type CertificateType, type CertificateRecord, type CertificateTemplate,
} from "../lib/certificatePdf";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");
const TEMPLATE_KEY = "parish_cert_template";

interface Props {
  type: CertificateType;
  record: CertificateRecord;
  /** Extra classes for the trigger button. */
  className?: string;
  label?: string;
}

/**
 * Print button + template picker for sacramental certificates. The chosen
 * template is remembered per admin (localStorage) across all registries.
 */
export default function CertificatePrintButton({ type, record, className, label }: Readonly<Props>) {
  const { parish } = useParishConfig();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<CertificateTemplate>(
    () => (localStorage.getItem(TEMPLATE_KEY) as CertificateTemplate) || "classic"
  );
  const [printing, setPrinting] = useState(false);

  const print = async () => {
    setPrinting(true);
    try {
      await buildCertificatePdf(type, record, parish, template);
      localStorage.setItem(TEMPLATE_KEY, template);
      // Audit the issuance — fire-and-forget; a failed log must not block printing.
      void fetch(`${API}/records/certificates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ type, record_id: record.id }),
      }).catch(() => {});
      setOpen(false);
    } catch {
      toast.error("Failed to generate certificate");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" title={`Print ${type} certificate`} className={className} onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4" />
        {label && <span className="ml-1">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Print Certificate</DialogTitle>
            <DialogDescription>
              Choose a layout for the {type} certificate of {String(record.name || record.full_name || `${record.groom_name || ""} & ${record.bride_name || ""}`)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2" role="radiogroup" aria-label="Certificate template">
            {CERTIFICATE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={template === t.id}
                onClick={() => setTemplate(t.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  template === t.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full border ${template === t.id ? "bg-blue-600 border-blue-600" : "border-gray-300"}`} />
                  <span className="font-medium text-sm">{t.name}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 ml-5">{t.blurb}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={printing}>Cancel</Button>
            <Button onClick={() => void print()} disabled={printing}>
              {printing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
              {printing ? "Generating…" : "Generate PDF"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
