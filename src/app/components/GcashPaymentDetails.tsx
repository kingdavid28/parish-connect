import { ZoomIn } from "lucide-react";

interface GcashPaymentDetailsProps {
  number: string;
  name: string;
  qrUrl: string;
  onShowQr: () => void;
  rateLabel?: string;
}

export default function GcashPaymentDetails({
  number,
  name,
  qrUrl,
  onShowQr,
  rateLabel,
}: Readonly<GcashPaymentDetailsProps>) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center">
      {qrUrl && (
        <button
          type="button"
          onClick={onShowQr}
          className="relative group cursor-zoom-in"
          aria-label="Enlarge GCash QR code"
          title="Tap to enlarge"
        >
          <img
            src={qrUrl}
            alt="GCash QR"
            className="w-40 h-40 rounded-xl border object-contain bg-white"
            decoding="async"
            onError={(event) => {
              const button = event.currentTarget.closest("button");
              if (button) button.style.display = "none";
            }}
          />
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="h-4 w-4" />
          </span>
        </button>
      )}
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-gray-500">GCash Number</p>
          <p className="text-xl font-bold tracking-widest">{number || "Unavailable"}</p>
        </div>
        <div>
          <p className="text-gray-500">Account Name</p>
          <p className="font-semibold">{name || "Unavailable"}</p>
        </div>
        {rateLabel && (
          <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
            <p className="font-medium text-yellow-700">{rateLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}
