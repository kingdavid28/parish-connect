import React, { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Download, QrCode, Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const APP_URL = "https://sanvicenteferrerparish-franciscan.com/parish-connect";
const APP_NAME = "Parish Connect";
const PARISH_NAME = "San Vicente Ferrer Parish - Franciscans";

export default function QRCodePage() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    const [size, setSize] = useState(256);

    const downloadQR = () => {
        const canvas = canvasRef.current?.querySelector("canvas");
        if (!canvas) return;

        // Create a new canvas with padding and branding
        const padding = 32;
        const labelHeight = 80;
        const branded = document.createElement("canvas");
        branded.width = canvas.width + padding * 2;
        branded.height = canvas.height + padding * 2 + labelHeight;

        const ctx = branded.getContext("2d");
        if (!ctx) return;

        // White background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, branded.width, branded.height);

        // Blue header bar
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(0, 0, branded.width, 48);

        // App name in header
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(APP_NAME, branded.width / 2, 30);

        // QR code
        ctx.drawImage(canvas, padding, 56);

        // Parish name below QR
        ctx.fillStyle = "#374151";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(PARISH_NAME, branded.width / 2, canvas.height + 56 + padding + 20);

        ctx.fillStyle = "#6b7280";
        ctx.font = "11px sans-serif";
        ctx.fillText("Scan to access the app", branded.width / 2, canvas.height + 56 + padding + 40);

        // Download
        const link = document.createElement("a");
        link.download = "parish-connect-qr.png";
        link.href = branded.toDataURL("image/png");
        link.click();
        toast.success("QR code downloaded!");
    };

    const copyLink = async () => {
        await navigator.clipboard.writeText(APP_URL);
        setCopied(true);
        toast.success("Link copied!");
        setTimeout(() => setCopied(false), 2000);
    };

    const shareApp = async () => {
        if (navigator.share) {
            await navigator.share({ title: APP_NAME, text: `Join ${PARISH_NAME} on Parish Connect`, url: APP_URL });
        } else {
            copyLink();
        }
    };

    return (
        <div className="max-w-lg mx-auto px-4 py-8">
            <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
                    <QrCode className="h-7 w-7 text-white" />
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">App QR Code</h1>
                <p className="text-gray-500 mt-1 text-sm">Share this QR code to invite parishioners</p>
            </div>

            <Card className="mb-6">
                <CardContent className="pt-6 flex flex-col items-center gap-6">
                    {/* QR Code */}
                    <div ref={canvasRef} className="p-4 bg-white rounded-2xl shadow-inner border border-gray-100">
                        <QRCodeCanvas
                            value={APP_URL}
                            size={size}
                            level="H"
                            includeMargin={false}
                            imageSettings={{
                                src: import.meta.env.BASE_URL + "parish-connect-logo.png",
                                height: 48,
                                width: 48,
                                excavate: true,
                            }}
                        />
                    </div>

                    {/* URL */}
                    <div className="w-full text-center">
                        <Badge variant="secondary" className="text-xs px-3 py-1 font-mono break-all">
                            {APP_URL}
                        </Badge>
                    </div>

                    {/* Size selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Size:</span>
                        {[128, 256, 512].map((s) => (
                            <Button
                                key={s}
                                variant={size === s ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSize(s)}
                                className="text-xs"
                            >
                                {s}px
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Actions */}
            <div className="grid grid-cols-1 gap-3">
                <Button onClick={downloadQR} className="w-full" size="lg">
                    <Download className="h-5 w-5 mr-2" />
                    Download QR Code (PNG)
                </Button>
                <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" onClick={copyLink} className="w-full">
                        {copied ? <Check className="h-4 w-4 mr-2 text-green-600" /> : <Copy className="h-4 w-4 mr-2" />}
                        {copied ? "Copied!" : "Copy Link"}
                    </Button>
                    <Button variant="outline" onClick={shareApp} className="w-full">
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                    </Button>
                </div>
            </div>

            <Card className="mt-6 bg-blue-50 border-blue-100">
                <CardContent className="pt-4 pb-4">
                    <p className="text-sm text-blue-700 text-center">
                        Print and display this QR code in the parish to let parishioners easily access the app.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
