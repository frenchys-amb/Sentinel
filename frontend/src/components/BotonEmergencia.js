import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { AlertCircle, Pill, X, PenLine } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { parsearGS1 } from '../utils/gs1';
import SignatureModal from './SignatureModal';

const BotonEmergencia = ({ user, onSuccess }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [medicamentos, setMedicamentos] = useState([]);
  const [selectedMed, setSelectedMed] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [testigoId, setTestigoId] = useState('');
  const [firma, setFirma] = useState(null);          // imagen de la firma (data URL)
  const [showFirmaModal, setShowFirmaModal] = useState(false);
  const [cajaId, setCajaId] = useState('');
  const [cajas, setCajas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [inventarios, setInventarios] = useState([]); // lotes con stock en la caja elegida
  const [lote, setLote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  // Al elegir caja + medicamento, cargar los lotes con stock disponible
  useEffect(() => {
    if (!cajaId || !selectedMed) { setInventarios([]); setLote(''); return; }
    api.get('/medicamentos/inventario/', { params: { caja: cajaId, medicamento: selectedMed.id } })
      .then(res => {
        const items = (res.data.results || res.data).filter(i => i.cantidad > 0);
        setInventarios(items);
        setLote(items.length > 0 ? items[0].lote : '');
      })
      .catch(() => { setInventarios([]); setLote(''); });
  }, [cajaId, selectedMed]);

  useEffect(() => {
    if (step === 1 && isOpen) {
      const scanner = new Html5QrcodeScanner('qr-reader', {
        qrbox: { width: 250, height: 250 }, fps: 10,
      }, false);
      scanner.render(
        (decodedText) => {
          // GS1 DataMatrix (NDC embebido) o codigo de barras simple del catalogo
          const r = parsearGS1(decodedText);
          const med = (r.esGS1 && r.candidatosNdc.length)
            ? medicamentos.find(m => m.ndc && r.candidatosNdc.includes(m.ndc))
            : medicamentos.find(m => m.codigo_barras === decodedText);
          if (med) { setSelectedMed(med); scanner.clear(); setStep(2); }
        },
        () => {}
      );
      scannerRef.current = scanner;
      return () => { if (scannerRef.current) scannerRef.current.clear().catch(() => {}); };
    }
  }, [step, isOpen, medicamentos]);

  const fetchData = async () => {
    try {
      const [medsRes, cajasRes, usersRes] = await Promise.all([
        api.get('/medicamentos/medicamentos/'),
        api.get('/medicamentos/cajas/'),
        api.get('/auth/usuarios/'),
      ]);
      setMedicamentos(medsRes.data.results || medsRes.data);
      setCajas(cajasRes.data.results || cajasRes.data);
      setUsuarios(usersRes.data.results || usersRes.data);
    } catch (err) {
      console.error('Error cargando datos:', err);
    }
  };

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      await api.post('/transacciones/', {
        tipo: 'ADMINISTRATION',
        caja_origen: cajaId,
        medicamento: selectedMed.id,
        cantidad: parseInt(cantidad),
        lote: lote,
        testigo: testigoId || null,
        firma_usuario: 'FIRMA_DIGITAL_' + user.id,
        motivo: 'Administracion de emergencia',
        paciente_id: 'EMERGENCIA_' + Date.now(),
      });
      handleClose();
      if (onSuccess) onSuccess();
      // Success handled by caller — no alert()
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        const msg = typeof data === 'string'
          ? data
          : Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
        setError(msg);
      } else {
        setError('Error al registrar la transaccion');
      }
    } finally { setLoading(false); }
  };

  const handleClose = () => {
    setIsOpen(false); setStep(1); setSelectedMed(null); setError('');
    setCantidad(1); setTestigoId(''); setFirma(null); setShowFirmaModal(false);
    setCajaId(''); setLote(''); setInventarios([]);
    if (scannerRef.current) scannerRef.current.clear().catch(() => {});
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-700 text-white rounded-2xl px-5 py-3.5 shadow-elevated hover:shadow-lg transition-all z-50 flex items-center gap-2.5 group"
      >
        <AlertCircle className="h-5 w-5 group-hover:animate-pulse" />
        <span className="font-bold text-sm tracking-wide">EMERGENCIA</span>
      </button>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content w-full max-w-lg p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-500 text-white p-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <h2 className="font-bold text-lg">Modo Emergencia</h2>
          </div>
          <button onClick={handleClose} className="hover:bg-white/10 p-1.5 rounded-xl transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-3 p-4 bg-gray-50 border-b border-gray-100">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                s === step ? 'bg-red-600 text-white shadow-sm' :
                s < step ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-200 text-gray-400'
              }`}>
                {s < step ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 rounded ${s < step ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-500 py-2 bg-gray-50">
          {step === 1 ? 'Escanear' : step === 2 ? 'Administrar' : 'Confirmar Testigo'}
        </p>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div id="qr-reader" className="w-full rounded-xl overflow-hidden" />
              <p className="text-center text-sm text-gray-500">Escanea el codigo de barras del medicamento</p>
              <div className="border-t border-gray-100" />
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">O selecciona manualmente:</p>
                <select
                  className="input-field"
                  onChange={(e) => {
                    const med = medicamentos.find(m => m.id === parseInt(e.target.value));
                    if (med) { setSelectedMed(med); setStep(2); }
                  }}
                  value=""
                >
                  <option value="">Seleccionar medicamento...</option>
                  {medicamentos.map((med) => (
                    <option key={med.id} value={med.id}>{med.nombre} {med.concentracion}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 2 && selectedMed && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <Pill className="h-5 w-5 text-blue-900" />
                  <span className="font-semibold text-gray-900">{selectedMed.nombre}</span>
                </div>
                <p className="text-sm text-gray-600">{selectedMed.concentracion} · {selectedMed.presentacion}</p>
                {selectedMed.tipo === 'NARCOTICO' && (
                  <p className="text-xs text-red-600 font-medium mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    NARCOTICO - Requiere testigo obligatorio
                  </p>
                )}
              </div>
              <div>
                <label className="input-label">Caja de origen</label>
                <select className="input-field" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
                  <option value="">Seleccionar caja...</option>
                  {cajas.map((caja) => (
                    <option key={caja.id} value={caja.id}>{caja.codigo} - {caja.nombre}</option>
                  ))}
                </select>
              </div>
              {cajaId && (
                inventarios.length > 0 ? (
                  <div>
                    <label className="input-label">Lote</label>
                    <select className="input-field" value={lote} onChange={(e) => setLote(e.target.value)}>
                      {inventarios.map((inv) => (
                        <option key={inv.id} value={inv.lote}>
                          {inv.lote || '(sin lote)'} — {inv.cantidad} disp.{inv.fecha_caducidad ? ` · vence ${inv.fecha_caducidad}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Esta caja no tiene stock de {selectedMed.nombre}. Selecciona otra caja.
                  </div>
                )
              )}
              <div>
                <label className="input-label">Cantidad</label>
                <input type="number" min="1" className="input-field" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </div>
              <button onClick={() => setStep(3)} disabled={!cajaId || inventarios.length === 0} className="w-full btn-primary disabled:opacity-50">
                Continuar
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-1.5 text-sm">
                <p className="text-gray-700"><span className="text-gray-400">Medicamento:</span> <strong className="text-gray-900">{selectedMed?.nombre}</strong></p>
                <p className="text-gray-700"><span className="text-gray-400">Cantidad:</span> <strong className="text-gray-900">{cantidad}</strong></p>
                <p className="text-gray-700"><span className="text-gray-400">Caja:</span> <strong className="text-gray-900">{cajas.find(c => c.id === parseInt(cajaId))?.codigo}</strong></p>
              </div>

              {(selectedMed?.tipo === 'NARCOTICO' || selectedMed?.requiere_doble_factor) && (
                <div>
                  <label className="input-label">Testigo obligatorio <span className="text-red-600">*</span></label>
                  <select className="input-field" value={testigoId} onChange={(e) => setTestigoId(e.target.value)} required>
                    <option value="">Seleccionar testigo...</option>
                    {usuarios.filter(u => u.id !== user.id).map((u) => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="input-label">Firma Digital <span className="text-red-600">*</span></label>
                {firma ? (
                  <div className="flex items-center gap-3">
                    <div className="border border-emerald-200 rounded-xl bg-emerald-50/50 p-1.5 flex-1">
                      <img src={firma} alt="Firma" className="h-12 w-full object-contain" />
                    </div>
                    <button type="button" onClick={() => setFirma(null)}
                      className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap">Borrar</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowFirmaModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-700 transition-colors">
                    <PenLine className="h-4 w-4" />
                    Firmar
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 btn-secondary">Atras</button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !firma || ((selectedMed?.tipo === 'NARCOTICO') && !testigoId)}
                  className="flex-1 btn-success disabled:opacity-50"
                >
                  {loading ? 'Registrando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SignatureModal
        isOpen={showFirmaModal}
        title="Firma Digital"
        onSave={(dataUrl) => { setFirma(dataUrl); setShowFirmaModal(false); }}
        onCancel={() => setShowFirmaModal(false)}
      />
    </div>
  );
};

export default BotonEmergencia;
