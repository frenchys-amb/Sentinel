import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Modal de confirmación reutilizable que reemplaza window.confirm() y prompt()
 *
 * Props:
 * - isOpen: boolean
 * - title: string
 * - message: string
 * - confirmLabel: string (default: "Confirmar")
 * - cancelLabel: string (default: "Cancelar")
 * - variant: "danger" | "warning" | "info" (default: "info")
 * - withInput: boolean - si true, muestra un textarea para notas
 * - inputLabel: string
 * - inputPlaceholder: string
 * - inputRequired: boolean
 * - onConfirm: (inputValue?: string) => void
 * - onCancel: () => void
 */
const ConfirmModal = ({
  isOpen,
  title = 'Confirmar accion',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'info',
  withInput = false,
  inputLabel = 'Notas',
  inputPlaceholder = 'Escriba aqui...',
  inputRequired = false,
  onConfirm,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState('');

  if (!isOpen) return null;

  const variantStyles = {
    danger: { btn: 'btn-danger', icon: 'bg-red-50 text-red-600' },
    warning: { btn: 'bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all', icon: 'bg-amber-50 text-amber-600' },
    info: { btn: 'btn-primary', icon: 'bg-blue-50 text-blue-900' },
  };

  const styles = variantStyles[variant] || variantStyles.info;

  const handleConfirm = () => {
    if (withInput && inputRequired && !inputValue.trim()) return;
    onConfirm(withInput ? inputValue.trim() : undefined);
    setInputValue('');
  };

  const handleCancel = () => {
    setInputValue('');
    onCancel();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div className="modal-content w-full max-w-md">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-xl shrink-0 ${styles.icon}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              {message && <p className="text-sm text-gray-500 mt-1">{message}</p>}
            </div>
            <button onClick={handleCancel} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {withInput && (
            <div className="mt-4">
              <label className="input-label">{inputLabel} {inputRequired && <span className="text-red-500">*</span>}</label>
              <textarea
                className="input-field"
                rows="3"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder}
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-0">
          <button onClick={handleCancel} className="flex-1 btn-secondary">
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={withInput && inputRequired && !inputValue.trim()}
            className={`flex-1 inline-flex items-center justify-center ${styles.btn} disabled:opacity-50`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
