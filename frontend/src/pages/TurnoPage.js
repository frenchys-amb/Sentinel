import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import SignatureModal from '../components/SignatureModal';
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Clock,
  Lock,
  Package,
  PenLine,
  ShieldCheck,
  XCircle
} from 'lucide-react';

const TurnoPage = ({ user }) => {
  const [turnoActual, setTurnoActual] = useState(null);
  const [cajas, setCajas] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [discrepanciasResult, setDiscrepanciasResult] = useState([]);

  const [startForm, setStartForm] = useState({
    caja: '',
    conteo_inicial_confirmado: false
  });
  const [conteoInicial, setConteoInicial] = useState({});

  const [closeForm, setCloseForm] = useState({
    conteo_final_confirmado: false,
    notas_cierre: ''
  });
  const [conteoFinal, setConteoFinal] = useState({});

  // Signature state
  const [signatureModal, setSignatureModal] = useState({ open: false, key: '', title: '' });
  const [signatures, setSignatures] = useState({
    firma_inicio: null,
    firma_cierre: null,
  });

  const cajaSeleccionada = useMemo(() => {
    const cajaId = turnoActual?.caja || startForm.caja;
    return cajas.find((caja) => caja.id === parseInt(cajaId));
  }, [cajas, startForm.caja, turnoActual]);

  const fetchTurno = async () => {
    const res = await api.get('/transacciones/turnos/actual/');
    setTurnoActual(res.data.turno);
  };

  const fetchCajas = async () => {
    const res = await api.get('/medicamentos/cajas/');
    setCajas(res.data.results || res.data);
  };

  const fetchInventario = async (cajaId) => {
    if (!cajaId) { setInventario([]); return; }
    const res = await api.get(`/medicamentos/inventario/?caja=${cajaId}`);
    const items = res.data.results || res.data;
    setInventario(items);
    return items;
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true); setError('');
      try { await Promise.all([fetchTurno(), fetchCajas()]); }
      catch (err) { setError('Error al cargar la información de turno'); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cajaId = turnoActual?.caja || startForm.caja;
    if (cajaId) {
      fetchInventario(cajaId).then((items) => {
        if (items) {
          const counts = {};
          items.forEach((item) => { counts[item.id] = item.cantidad; });
          if (!turnoActual) setConteoInicial(counts);
          else setConteoFinal(counts);
        }
      });
    } else { setInventario([]); }
  }, [startForm.caja, turnoActual]);

  const conteoInicialTieneDiferencias = useMemo(() => {
    return inventario.some((item) => conteoInicial[item.id] !== item.cantidad);
  }, [inventario, conteoInicial]);

  const conteoFinalTieneDiferencias = useMemo(() => {
    return inventario.some((item) => conteoFinal[item.id] !== item.cantidad);
  }, [inventario, conteoFinal]);

  const handleStartTurno = async (e) => {
    e.preventDefault();
    if (!signatures.firma_inicio) return;
    setLoading(true); setError(''); setSuccess(''); setDiscrepanciasResult([]);
    try {
      const conteoFisicoInicial = inventario.map((item) => ({
        inventario_id: item.id,
        medicamento_id: item.medicamento,
        medicamento_nombre: item.medicamento_nombre,
        medicamento_tipo: item.medicamento_tipo,
        cantidad: item.cantidad,
        cantidad_fisica: conteoInicial[item.id] ?? item.cantidad,
        lote: item.lote,
        fecha_caducidad: item.fecha_caducidad,
      }));

      await api.post('/transacciones/turnos/', {
        caja: parseInt(startForm.caja),
        firma_inicio: 'FIRMA_DIGITAL_' + user.id,
        conteo_inicial_confirmado: startForm.conteo_inicial_confirmado,
        conteo_fisico_inicial: conteoFisicoInicial,
      });
      setSuccess('Turno iniciado y caja confirmada');
      setStartForm({ caja: '', conteo_inicial_confirmado: false });
      setConteoInicial({});
      setSignatures(prev => ({ ...prev, firma_inicio: null }));
      await fetchTurno();
    } catch (err) {
      setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Error al iniciar turno');
    } finally { setLoading(false); }
  };

  const handleCloseTurno = async (e) => {
    e.preventDefault();
    if (!signatures.firma_cierre) return;
    setLoading(true); setError(''); setSuccess(''); setDiscrepanciasResult([]);
    try {
      const conteoFisicoFinal = inventario.map((item) => ({
        inventario_id: item.id,
        medicamento_id: item.medicamento,
        medicamento_nombre: item.medicamento_nombre,
        medicamento_tipo: item.medicamento_tipo,
        cantidad: item.cantidad,
        cantidad_fisica: conteoFinal[item.id] ?? item.cantidad,
        lote: item.lote,
        fecha_caducidad: item.fecha_caducidad,
      }));

      const res = await api.post('/transacciones/turnos/cerrar_actual/', {
        firma_cierre: 'FIRMA_DIGITAL_' + user.id,
        conteo_final_confirmado: closeForm.conteo_final_confirmado,
        notas_cierre: closeForm.notas_cierre,
        conteo_fisico_final: conteoFisicoFinal,
      });

      const disc = res.data.discrepancias || [];
      setDiscrepanciasResult(disc);
      setSuccess(disc.length > 0
        ? `Turno cerrado. ${disc.length} discrepancia(s) — alertas generadas.`
        : 'Turno cerrado sin discrepancias.');
      setCloseForm({ conteo_final_confirmado: false, notas_cierre: '' });
      setConteoFinal({});
      setSignatures(prev => ({ ...prev, firma_cierre: null }));
      await fetchTurno();
    } catch (err) {
      setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Error al cerrar turno');
    } finally { setLoading(false); }
  };

  const fechaInicio = turnoActual?.fecha_inicio
    ? new Date(turnoActual.fecha_inicio).toLocaleString('es-MX')
    : '';

  // ─── Signature preview (same pattern as CustodiaPage) ───
  const SignaturePreview = ({ sigKey, label, required }) => {
    const sig = signatures[sigKey];
    return (
      <div>
        <label className="input-label">{label} {required && '*'}</label>
        {sig ? (
          <div className="flex items-center gap-3">
            <div className="border border-emerald-200 rounded-xl bg-emerald-50/50 p-1.5 flex-1">
              <img src={sig} alt="Firma" className="h-12 w-full object-contain" />
            </div>
            <button type="button" onClick={() => setSignatures(prev => ({ ...prev, [sigKey]: null }))}
              className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap">Borrar</button>
          </div>
        ) : (
          <button type="button"
            onClick={() => setSignatureModal({
              open: true,
              key: sigKey,
              title: label
            })}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-700 transition-colors">
            <PenLine className="h-4 w-4" />
            Firmar
          </button>
        )}
      </div>
    );
  };

  const renderInventarioTable = (mode) => {
    const isStart = mode === 'start';
    const conteo = isStart ? conteoInicial : conteoFinal;
    const setConteo = isStart ? setConteoInicial : setConteoFinal;
    const editable = isStart ? !turnoActual : !!turnoActual;

    return (
      <div className="overflow-x-auto">
        <table className="table-pro">
          <thead><tr><th>Medicamento</th><th>Tipo</th><th>Lote</th><th className="text-right">Sistema</th><th className="text-right">Conteo Fisico</th><th>Vencimiento</th><th className="text-center">Estado</th></tr></thead>
          <tbody>
            {inventario.map((item) => {
              const fisico = conteo[item.id] ?? item.cantidad;
              const diff = fisico - item.cantidad;
              const hasDiff = diff !== 0;
              const isNarcotico = item.medicamento_tipo === 'NARCOTICO';
              return (
                <tr key={item.id} className={hasDiff ? (isNarcotico ? 'bg-red-50' : 'bg-amber-50') : ''}>
                  <td className="font-medium text-gray-900">{item.medicamento_nombre}</td>
                  <td><span className={`badge text-[10px] ${isNarcotico ? 'bg-red-100 text-red-800' : item.medicamento_tipo === 'CONTROLADO' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{item.medicamento_tipo}</span></td>
                  <td className="text-gray-700">{item.lote || '—'}</td>
                  <td className="text-right font-semibold text-gray-700">{item.cantidad}</td>
                  <td className="text-right">
                    {editable ? (
                      <input type="number" min="0" className={`w-20 text-right px-2 py-1 rounded-lg border text-sm font-semibold ${hasDiff ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200'}`} value={fisico} onChange={(e) => setConteo({ ...conteo, [item.id]: parseInt(e.target.value) || 0 })} />
                    ) : <span className="font-semibold text-gray-700">{fisico}</span>}
                  </td>
                  <td><span className={`badge text-[10px] ${item.vencido ? 'bg-red-100 text-red-800' : item.proximo_a_vencer ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{item.fecha_caducidad || 'N/R'}</span></td>
                  <td className="text-center">{hasDiff ? <span className="text-xs font-bold text-red-700 flex items-center justify-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{diff > 0 ? `+${diff}` : diff}</span> : <Check className="h-4 w-4 text-emerald-500 mx-auto" />}</td>
                </tr>
              );
            })}
            {inventario.length === 0 && <tr><td colSpan="7" className="text-center text-gray-400 py-10">No hay inventario para esta caja</td></tr>}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Turno EMS</h1>
          <p className="text-gray-500">Recepcion, conteo fisico y cierre de caja</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
          turnoActual ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
        }`}>
          {turnoActual ? <ShieldCheck className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {turnoActual ? 'TURNO ACTIVO' : 'SIN TURNO ACTIVO'}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm flex items-center gap-2"><Check className="h-4 w-4 shrink-0" />{success}</div>}

      {/* Discrepancies */}
      {discrepanciasResult.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <h3 className="font-bold text-red-800 flex items-center gap-2 mb-3"><AlertTriangle className="h-5 w-5" />Discrepancias al Cierre ({discrepanciasResult.length})</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-red-700"><th className="px-3 py-2 text-left font-semibold">Medicamento</th><th className="px-3 py-2 text-right font-semibold">Esperado</th><th className="px-3 py-2 text-right font-semibold">Fisico</th><th className="px-3 py-2 text-right font-semibold">Dif.</th></tr></thead>
            <tbody className="divide-y divide-red-200">
              {discrepanciasResult.map((d, i) => (
                <tr key={i}><td className="px-3 py-2 font-medium text-red-900">{d.medicamento_nombre}{d.medicamento_tipo === 'NARCOTICO' && <span className="ml-2 px-1.5 py-0.5 bg-red-200 text-red-900 text-[10px] rounded font-bold">NARCOTICO</span>}</td><td className="px-3 py-2 text-right">{d.cantidad_esperada}</td><td className="px-3 py-2 text-right font-bold">{d.cantidad_fisica}</td><td className="px-3 py-2 text-right font-bold">{d.diferencia > 0 ? `+${d.diferencia}` : d.diferencia}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inventory table */}
        <div className="lg:col-span-2 card p-0 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-900" />
              {turnoActual ? 'Inventario Actual' : 'Conteo Fisico Inicial'}
            </h2>
            {cajaSeleccionada && <span className="text-sm text-gray-400">{cajaSeleccionada.codigo} — {cajaSeleccionada.nombre}</span>}
          </div>

          {!cajaSeleccionada && <p className="text-center text-gray-400 py-10">Selecciona una caja para el conteo</p>}
          {cajaSeleccionada && renderInventarioTable(turnoActual ? 'close' : 'start')}

          {cajaSeleccionada && !turnoActual && conteoInicialTieneDiferencias && (
            <div className="m-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">El conteo difiere del sistema. Se generaran alertas al iniciar.</p>
            </div>
          )}
          {cajaSeleccionada && turnoActual && conteoFinalTieneDiferencias && (
            <div className="m-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-800">Diferencias detectadas. Se generaran alertas al cerrar.</p>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Status card */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-900" />Estado del turno
            </h2>
            {turnoActual ? (
              <div className="space-y-3 text-sm">
                <div><p className="text-xs font-semibold text-gray-500 uppercase">Usuario</p><p className="font-medium text-gray-900">{turnoActual.usuario_nombre || `${user.first_name} ${user.last_name}`}</p></div>
                <div><p className="text-xs font-semibold text-gray-500 uppercase">Inicio</p><p className="font-medium text-gray-900">{fechaInicio}</p></div>
                <div><p className="text-xs font-semibold text-gray-500 uppercase">Caja</p><p className="font-medium text-gray-900">{turnoActual.caja_codigo} — {turnoActual.caja_nombre}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3"><p className="text-xs text-blue-700">Administraciones</p><p className="text-xl font-bold text-blue-900">{turnoActual.contador_administration}</p></div>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3"><p className="text-xs text-red-700">Descartes</p><p className="text-xl font-bold text-red-900">{turnoActual.contador_waste}</p></div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Inicia un turno para habilitar custodia de caja.</p>
            )}
          </div>

          {/* ─── Start Shift Form ─── */}
          {!turnoActual && (
            <form onSubmit={handleStartTurno} className="card space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-900" />Iniciar turno
              </h2>

              <div>
                <label className="input-label">Caja asignada *</label>
                <select className="input-field" required value={startForm.caja} onChange={(e) => setStartForm({ ...startForm, caja: e.target.value })}>
                  <option value="">Seleccionar caja...</option>
                  {cajas.filter(c => c.estado === 'ACTIVA').map(c => (
                    <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-start gap-2 bg-blue-50/60 border border-blue-100 p-3 rounded-lg">
                <input id="conteo-inicial" type="checkbox" className="h-4 w-4 mt-0.5 rounded text-blue-900 border-gray-300"
                  checked={startForm.conteo_inicial_confirmado}
                  onChange={(e) => setStartForm({ ...startForm, conteo_inicial_confirmado: e.target.checked })} />
                <label htmlFor="conteo-inicial" className="text-sm text-blue-900 font-medium">
                  Confirmo que realice el conteo fisico y los valores son correctos.
                </label>
              </div>

              <SignaturePreview sigKey="firma_inicio" label="Firma de inicio" required />

              <button type="submit" disabled={loading || !startForm.conteo_inicial_confirmado || !signatures.firma_inicio}
                className="w-full btn-primary disabled:opacity-40 flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" />{loading ? 'Iniciando...' : 'Iniciar Turno'}
              </button>
            </form>
          )}

          {/* ─── Close Shift Form ─── */}
          {turnoActual && (
            <form onSubmit={handleCloseTurno} className="card space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-900" />Cerrar turno
              </h2>
              <p className="text-xs text-gray-500">Ingrese el conteo fisico en la tabla y confirme.</p>

              <div className="flex items-start gap-2 bg-amber-50/70 border border-amber-100 p-3 rounded-lg">
                <input id="conteo-final" type="checkbox" className="h-4 w-4 mt-0.5 rounded text-blue-900 border-gray-300"
                  checked={closeForm.conteo_final_confirmado}
                  onChange={(e) => setCloseForm({ ...closeForm, conteo_final_confirmado: e.target.checked })} />
                <label htmlFor="conteo-final" className="text-sm text-amber-900 font-medium">
                  Confirmo que realice el conteo final y los valores son correctos.
                </label>
              </div>

              <div>
                <label className="input-label">Notas de cierre</label>
                <textarea className="input-field" rows="2" value={closeForm.notas_cierre}
                  onChange={(e) => setCloseForm({ ...closeForm, notas_cierre: e.target.value })}
                  placeholder="Observaciones..." />
              </div>

              <SignaturePreview sigKey="firma_cierre" label="Firma de cierre" required />

              <button type="submit" disabled={loading || !closeForm.conteo_final_confirmado || !signatures.firma_cierre}
                className="w-full btn-danger disabled:opacity-40 flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" />{loading ? 'Cerrando...' : 'Cerrar Turno'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Signature Modal */}
      <SignatureModal
        isOpen={signatureModal.open}
        title={signatureModal.title || 'Firma Digital'}
        onSave={(dataUrl) => {
          setSignatures(prev => ({ ...prev, [signatureModal.key]: dataUrl }));
          setSignatureModal({ open: false, key: '', title: '' });
        }}
        onCancel={() => setSignatureModal({ open: false, key: '', title: '' })}
      />
    </div>
  );
};

export default TurnoPage;
