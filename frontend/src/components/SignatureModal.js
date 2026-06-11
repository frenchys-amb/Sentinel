import React, { useRef, useState, useEffect } from 'react';
import { PenLine, X, RotateCcw, Check } from 'lucide-react';

/**
 * SignatureModal — Popup de firma digital con canvas.
 * Props:
 *  - isOpen: boolean
 *  - title: string (ej: "Firma del receptor")
 *  - onSave: (signatureDataUrl: string) => void
 *  - onCancel: () => void
 */
const SignatureModal = ({ isOpen, title = 'Firma Digital', onSave, onCancel }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 180;
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setHasSignature(false);
    }
  }, [isOpen]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSave = () => {
    if (!hasSignature) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-content w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-blue-900" />
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Canvas */}
        <div className="p-5">
          <p className="text-xs text-gray-500 mb-3">Firme en el area de abajo con el mouse o dedo</p>
          <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-gray-50">
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
          </div>
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={clearCanvas}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpiar
            </button>
            {!hasSignature && (
              <span className="text-xs text-gray-400">Sin firma</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onCancel} className="flex-1 btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!hasSignature}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
            Guardar Firma
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureModal;
