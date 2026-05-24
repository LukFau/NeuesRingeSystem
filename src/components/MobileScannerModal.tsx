import React, { useEffect, useState } from 'react';
import * as motion from 'motion/react-client';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

interface Props {
    onClose: () => void;
    onScan: (barcode: string) => void;
}

export default function MobileScannerModal({ onClose, onScan }: Props) {
    const [error, setError] = useState<string>('');
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);

    useEffect(() => {
        let isStopped = false;
        let html5QrCode: Html5Qrcode | null = null;

        // This helper ensures we only call the callback once
        const handleScan = (decodedText: string) => {
            if (isStopped) return;
            isStopped = true;
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => {
                    onScan(decodedText);
                    onClose();
                }).catch(err => {
                    console.error('Failed to stop scanner.', err);
                    onScan(decodedText);
                    onClose();
                });
            } else {
                onScan(decodedText);
                onClose();
            }
        };

        const startScanner = async () => {
            try {
                // Request camera exact permissions first to trigger the browser prompt
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                    // Keep the stream alive to prevent closing issues between permissions & scanner
                    stream.getTracks().forEach(track => track.stop());
                    setHasPermission(true);
                } catch (err: any) {
                    console.error("Camera permission error:", err);
                    setError(`Permission denied or camera unavailable. (${err.message})`);
                    setHasPermission(false);
                    return;
                }

                if (isStopped) return;

                html5QrCode = new Html5Qrcode("reader");

                const config = {
                    fps: 10,
                    qrbox: { width: 250, height: 150 },
                    aspectRatio: 1.0,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.QR_CODE
                    ]
                };

                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => {
                        handleScan(decodedText);
                    },
                    (errorMessage) => {
                        // Ignore continuous parsing errors
                    }
                );
            } catch (err: any) {
                if (!isStopped) {
                    setError(`Failed to start camera: ${err.message || 'Unknown error'}`);
                    console.error("Scanner error", err);
                }
            }
        };

        startScanner();

        return () => {
            isStopped = true;
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(console.error);
            }
            // Cleanup html5QrCode container if needed
        };
    }, [onClose, onScan]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-[#0F1115]/95 backdrop-blur-md"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-md bg-[#1A1D24] border border-[#2A2D35] rounded-3xl p-6 shadow-2xl flex flex-col items-center overflow-hidden"
            >
                <div className="flex w-full items-center justify-between mb-6 relative z-10">
                    <h2 className="text-white font-bold tracking-tight flex items-center gap-2">
                        <Camera className="w-5 h-5 text-amber-500" /> Scan Barcode
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full border border-[#2A2D35] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#2A2D35] transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {error ? (
                    <div className="w-full flex flex-col items-center pb-4">
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-center font-mono text-xs w-full mb-4">
                            {error}
                        </div>
                        <p className="text-zinc-400 text-xs text-center mb-4 px-2">
                            To use the camera, you must grant permission. Also ensure you are on a secure connection (HTTPS or localhost).
                        </p>
                        <a
                            href={window.location.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-[#2A2D35] hover:bg-[#3A3D45] text-white text-xs font-bold uppercase tracking-widest px-6 py-2 rounded-lg transition-colors border border-[#3A3D45]"
                        >
                            Open in New Tab
                        </a>
                    </div>
                ) : (
                    <div className="w-full bg-black rounded-2xl overflow-hidden shadow-inner border border-[#2A2D35] relative min-h-[250px]">
                        <div id="reader" className="w-full h-full text-white bg-black [&>video]:object-cover" />

                        {hasPermission === null && (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-xs font-mono">
                                Requesting camera access...
                            </div>
                        )}

                        {hasPermission === true && (
                            <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center">
                                <div className="mt-40 text-[10px] text-zinc-400 font-mono bg-black/50 px-3 py-1 rounded-full uppercase tracking-widest backdrop-blur-sm shadow-md">
                                    Align barcode in frame
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
