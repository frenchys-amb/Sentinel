import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X } from 'lucide-react';

/**
 * Escaner de empaques farmaceuticos.
 * Soporta GS1 DataMatrix (DSCSA: NDC + lote + expiracion), QR,
 * Code 128 y codigos lineales UPC/EAN.
 */
const ScannerGS1 = ({ onScan, onClose, titulo = 'Escanear empaque' }) => {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('gs1-reader', {
      fps: 10,
      qrbox: { width: 280, height: 200 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.EAN_13,
      ],
    }, false);

    scanner.render(
      (decodedText) => { onScanRef.current(decodedText); },
      () => {}
    );

    return () => { scanner.clear().catch(() => {}); };
  }, []);

  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{titulo}</p>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
      <div id="gs1-reader" className="w-full rounded-xl overflow-hidden" />
      <p className="text-xs text-gray-500 text-center">
        Apunta al DataMatrix del empaque — extrae NDC, lote y fecha de expiracion en un solo escaneo
      </p>
    </div>
  );
};

export default ScannerGS1;
