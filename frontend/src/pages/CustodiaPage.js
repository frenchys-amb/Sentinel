import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import SignatureModal from '../components/SignatureModal';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  History,
  Lock,
  LogIn,
  LogOut,
  Package,
  PenLine,
  ShieldCheck,
} from 'lucide-react';

const CustodiaPage = ({ user }) => {
  const [cajas, setCajas] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [usuarios, setUsuarios] = useState([]);
  const [selectedCaja, setSelectedCaja] = useState(null);
  const [inventario, setInventario] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [discrepanciasResult, setDiscrepanciasResult] = useState([]);
  const [activeTab, setActiveTab] = useState('checkout');
  const [adminCustodiaTab, setAdminCustodiaTab] = useState('realtime');
  const [conteoFisico, setConteoFisico] = useState({});

  // Signature state
  const [signatureModal, setSignatureModal] = useState({ open: false, field: '', formType: '' });
  const [signatures, setSignatures] = useState({
    checkout_firma_destino: null,
    checkout_firma_origen: null,
    checkout_firma_testigo: null,
    checkin_firma_origen: null,
    checkin_firma_destino: null,
    checkin_firma_testigo: null,
  });

  const [checkoutForm, setCheckoutForm] = useState({ quien_entrega: '', turno: '', notas: '', razon_tardanza: '' });
  const [checkinForm, setCheckinForm] = useState({ quien_entrega: '', turno: '', notas: '', razon_tardanza: '' });
  const [turnosConfig, setTurnosConfig] = useState([]);

  useEffect(() => {
    const init = async () => {
      try {
        const [cajasRes, usersRes, turnosRes] = await Promise.all([
          api.get('/medicamentos/cajas/'),
          api.get('/auth/usuarios/'),
          api.get('/turnos-config/'),
        ]);
        setCajas(cajasRes.data.results || cajasRes.data);
        setUsuarios(usersRes.data.results || usersRes.data);
        setTurnosConfig(turnosRes.data.results || turnosRes.data);
      } catch (err) {
        setError('Error al cargar datos');
      }
    };
    init();
  }, []);

  const fetchInventario = async (cajaId) => {
    if (!cajaId) { setInventario([]); return; }
    try {
      const res = await api.get(`/medicamentos/inventario/?caja=${cajaId}`);
      const items = res.data.results || res.data;
      setInventario(items);
      const counts = {};
      items.forEach((item) => { counts[item.id] = item.cantidad; });
      setConteoFisico(counts);
    } catch (err) { setInventario([]); }
  };

  const fetchHistorial = async (cajaId) => {
    if (!cajaId) { setHistorial([]); return; }
    try {
      const res = await api.get(`/medicamentos/cajas/${cajaId}/historial_custodia/`);
      setHistorial(res.data);
    } catch (err) { setHistorial([]); }
  };

  const handleSelectCaja = async (cajaId) => {
    const caja = cajas.find((c) => c.id === parseInt(cajaId));
    setSelectedCaja(caja || null);
    setError(''); setSuccess(''); setDiscrepanciasResult([]);
    if (caja) { await Promise.all([fetchInventario(caja.id), fetchHistorial(caja.id)]); }
  };

  const conteoTieneDiferencias = useMemo(() => {
    return inventario.some((item) => conteoFisico[item.id] !== item.cantidad);
  }, [inventario, conteoFisico]);

  // Check if current time is past the selected turno's hora_fin
  const isLateReturn = (turnoId) => {
    if (!turnoId) return false;
    const turno = turnosConfig.find(t => String(t.id) === String(turnoId));
    if (!turno || !turno.hora_fin) return false;
    const now = new Date();
    const [h, m] = turno.hora_fin.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(h, m, 0, 0);
    return now > endTime;
  };

  const buildConteoPayload = () =>
    inventario.map((item) => ({
      inventario_id: item.id,
      medicamento_id: item.medicamento,
      medicamento_nombre: item.medicamento_nombre,
      medicamento_tipo: item.medicamento_tipo,
      cantidad: item.cantidad,
      cantidad_fisica: conteoFisico[item.id] ?? item.cantidad,
      lote: item.lote,
      fecha_caducidad: item.fecha_caducidad,
    }));

  const openSignature = (field, formType) => {
    setSignatureModal({ open: true, field, formType });
  };

  const saveSignature = (dataUrl) => {
    const key = `${signatureModal.formType}_${signatureModal.field}`;
    setSignatures(prev => ({ ...prev, [key]: dataUrl }));
    setSignatureModal({ open: false, field: '', formType: '' });
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!selectedCaja || !signatures.checkout_firma_destino) return;
    setLoading(true); setError(''); setSuccess(''); setDiscrepanciasResult([]);
    try {
      const checkoutNotas = isLateReturn(checkoutForm.turno)
        ? `[ENTREGA TARDÍA] ${checkoutForm.razon_tardanza}${checkoutForm.notas ? ' | ' + checkoutForm.notas : ''}`
        : checkoutForm.notas;
      const res = await api.post(`/medicamentos/cajas/${selectedCaja.id}/checkout/`, {
        firma_destino: 'FIRMA_DIGITAL_' + user.id,
        firma_testigo: signatures.checkout_firma_testigo ? 'FIRMA_TESTIGO_' + user.id : '',
        responsable: user.id,
        quien_entrega: checkoutForm.quien_entrega,
        turno: checkoutForm.turno,
        notas: checkoutNotas,
        conteo_fisico: buildConteoPayload(),
      });
      const disc = res.data.discrepancias || [];
      setDiscrepanciasResult(disc);
      setSuccess(disc.length > 0 ? `Checkout con ${disc.length} discrepancia(s).` : 'Checkout registrado sin discrepancias.');
      setCheckoutForm({ quien_entrega: '', turno: '', notas: '', razon_tardanza: '' });
      setSignatures(prev => ({ ...prev, checkout_firma_destino: null, checkout_firma_testigo: null }));
      const cajasRes = await api.get('/medicamentos/cajas/');
      setCajas(cajasRes.data.results || cajasRes.data);
      await fetchHistorial(selectedCaja.id);
    } catch (err) {
      setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Error en checkout');
    } finally { setLoading(false); }
  };

  const handleCheckin = async (e) => {
    e.preventDefault();
    if (!selectedCaja || !signatures.checkin_firma_origen) return;
    setLoading(true); setError(''); setSuccess(''); setDiscrepanciasResult([]);
    try {
      const checkinNotas = isLateReturn(checkinForm.turno)
        ? `[ENTREGA TARDÍA] ${checkinForm.razon_tardanza}${checkinForm.notas ? ' | ' + checkinForm.notas : ''}`
        : checkinForm.notas;
      const res = await api.post(`/medicamentos/cajas/${selectedCaja.id}/checkin/`, {
        firma_origen: 'FIRMA_DIGITAL_' + user.id,
        firma_testigo: signatures.checkin_firma_testigo ? 'FIRMA_TESTIGO_' + user.id : '',
        responsable: user.id,
        quien_entrega: checkinForm.quien_entrega,
        turno: checkinForm.turno,
        notas: checkinNotas,
        conteo_fisico: buildConteoPayload(),
      });
      const disc = res.data.discrepancias || [];
      setDiscrepanciasResult(disc);
      setSuccess(disc.length > 0 ? `Checkin con ${disc.length} discrepancia(s).` : 'Checkin registrado sin discrepancias.');
      setCheckinForm({ quien_entrega: '', turno: '', notas: '', razon_tardanza: '' });
      setSignatures(prev => ({ ...prev, checkin_firma_origen: null, checkin_firma_testigo: null }));
      const cajasRes = await api.get('/medicamentos/cajas/');
      setCajas(cajasRes.data.results || cajasRes.data);
      await fetchHistorial(selectedCaja.id);
    } catch (err) {
      setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Error en checkin');
    } finally { setLoading(false); }
  };

  // ─── Signature preview helper ───
  const SignaturePreview = ({ signatureKey, label, required }) => {
    const sig = signatures[signatureKey];
    return (
      <div>
        <label className="input-label">{label} {required && '*'}</label>
        {sig ? (
          <div className="flex items-center gap-3">
            <div className="border border-emerald-200 rounded-xl bg-emerald-50/50 p-1.5 flex-1">
              <img src={sig} alt="Firma" className="h-12 w-full object-contain" />
            </div>
            <button type="button" onClick={() => setSignatures(prev => ({ ...prev, [signatureKey]: null }))}
              className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap">Borrar</button>
          </div>
        ) : (
          <button type="button"
            onClick={() => openSignature(signatureKey.split('_').slice(1).join('_'), signatureKey.split('_')[0])}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-700 transition-colors">
            <PenLine className="h-4 w-4" />
            Firmar
          </button>
        )}
      </div>
    );
  };

  // ─── ADMIN VIEW: Historial + Tiempo Real ───
  if (user?.rol === 'ADMIN') {
    const cajasEnCalle = cajas.filter(c => c.estado === 'EN_TRANSITO');
    const cajasEnCustodia = cajas.filter(c => c.estado !== 'EN_TRANSITO' && c.estado !== 'EXTRAVIADA');

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Custodia — Vista Admin</h1>
            <p className="text-gray-500">Estado en tiempo real e historial de cadena de custodia</p>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 text-blue-900 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-semibold">
            <ShieldCheck className="h-4 w-4" />ADMIN
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setAdminCustodiaTab('realtime')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${adminCustodiaTab === 'realtime' ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            <Package className="h-4 w-4" />Tiempo Real
          </button>
          <button onClick={() => setAdminCustodiaTab('historial')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${adminCustodiaTab === 'historial' ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            <History className="h-4 w-4" />Historial
          </button>
        </div>

        {adminCustodiaTab === 'realtime' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cajas en la calle */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <LogOut className="h-5 w-5 text-purple-600" />
                En la Calle ({cajasEnCalle.length})
              </h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {cajasEnCalle.map(caja => (
                  <div key={caja.id} className="p-3 rounded-xl border border-purple-200 bg-purple-50/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-gray-900">{caja.codigo}</span>
                        <span className="text-xs text-gray-500 ml-2">{caja.nombre}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${caja.estado === 'EN_TRANSITO' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}`}>{caja.estado}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Responsable: <span className="font-medium text-gray-700">{caja.responsable_nombre || 'Sin asignar'}</span>
                      {caja.unidad && <span className="ml-3">Unidad: {caja.unidad}</span>}
                    </div>
                  </div>
                ))}
                {cajasEnCalle.length === 0 && <p className="text-center text-gray-400 py-6">No hay cajas en la calle</p>}
              </div>
            </div>

            {/* Cajas en custodia */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-emerald-600" />
                En Custodia / Almacen ({cajasEnCustodia.length})
              </h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {cajasEnCustodia.map(caja => (
                  <div key={caja.id} className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-gray-900">{caja.codigo}</span>
                        <span className="text-xs text-gray-500 ml-2">{caja.nombre}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">{caja.estado}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Responsable: <span className="font-medium text-gray-700">{caja.responsable_nombre || 'Sin asignar'}</span>
                      {caja.unidad && <span className="ml-3">Unidad: {caja.unidad}</span>}
                    </div>
                  </div>
                ))}
                {cajasEnCustodia.length === 0 && <p className="text-center text-gray-400 py-6">No hay cajas en custodia</p>}
              </div>
            </div>
          </div>
        )}

        {adminCustodiaTab === 'historial' && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-blue-900" />Historial de Custodia
            </h3>
            <div className="mb-4">
              <label className="input-label">Seleccionar Caja para ver historial</label>
              <select className="input-field max-w-xs" onChange={(e) => handleSelectCaja(e.target.value)}>
                <option value="">Seleccionar caja...</option>
                {cajas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
            </div>
            {selectedCaja && (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {historial.map((entry) => (
                  <div key={entry.id} className={`border rounded-xl p-3 ${entry.discrepancias?.length > 0 ? 'border-red-200 bg-red-50/50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${entry.tipo === 'CHECKOUT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{entry.tipo}</span>
                      <span className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString('es-MX')}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm mt-1">
                      <span className="text-gray-500">{entry.usuario_origen_nombre || '—'}</span>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <span className="font-medium text-gray-900">{entry.usuario_destino_nombre}</span>
                    </div>
                    {entry.discrepancias?.length > 0 && <div className="mt-2 text-xs text-red-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{entry.discrepancias.length} discrepancia(s)</div>}
                    {entry.notas && <p className="mt-1 text-xs text-gray-500 italic">{entry.notas}</p>}
                  </div>
                ))}
                {historial.length === 0 && <p className="text-center text-gray-400 py-8">Sin registros de custodia para esta caja</p>}
              </div>
            )}
            {!selectedCaja && <p className="text-center text-gray-400 py-8">Seleccione una caja para ver su historial</p>}
          </div>
        )}
      </div>
    );
  }

  // ─── PARAMEDICO VIEW: full custody operations ───
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cadena de Custodia</h1>
          <p className="text-gray-500">Checkout, checkin y trazabilidad de cajas</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 text-blue-900 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-semibold">
          <ShieldCheck className="h-4 w-4" />CUSTODIA
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm flex items-center gap-2"><Check className="h-4 w-4 shrink-0" />{success}</div>}

      {/* ─── Compact Box Selector ─── */}
      <div className="card">
        <label className="input-label">Seleccionar Caja</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mt-2">
          {cajas.map((caja) => {
            const isSelected = selectedCaja?.id === caja.id;
            return (
              <button
                key={caja.id}
                onClick={() => handleSelectCaja(caja.id)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Package className={`h-4 w-4 ${isSelected ? 'text-blue-700' : 'text-gray-400'}`} />
                  <span className={`font-semibold text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>{caja.codigo}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{caja.nombre}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    caja.estado === 'ACTIVA' ? 'bg-emerald-100 text-emerald-800' :
                    caja.estado === 'EXTRAVIADA' ? 'bg-red-100 text-red-800' :
                    caja.estado === 'EN_TRANSITO' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-600'
                  }`}>{caja.estado}</span>
                </div>
              </button>
            );
          })}
          {cajas.length === 0 && <p className="col-span-full text-center text-gray-400 py-4">No hay cajas registradas</p>}
        </div>

        {selectedCaja && (
          <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100 text-sm">
            <div><span className="text-xs text-gray-400 uppercase font-semibold">Responsable</span><p className="font-semibold text-gray-900">{selectedCaja.responsable_nombre || 'Sin asignar'}</p></div>
            <div><span className="text-xs text-gray-400 uppercase font-semibold">Unidad</span><p className="font-semibold text-gray-900">{selectedCaja.unidad || '—'}</p></div>
          </div>
        )}
      </div>

      {selectedCaja && (
        <>
          {/* Discrepancies */}
          {discrepanciasResult.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-4">
              <h3 className="font-bold text-red-800 flex items-center gap-2 mb-3"><AlertTriangle className="h-5 w-5" />Discrepancias ({discrepanciasResult.length})</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-red-700"><th className="px-3 py-2 text-left font-semibold">Medicamento</th><th className="px-3 py-2 text-right font-semibold">Esperado</th><th className="px-3 py-2 text-right font-semibold">Fisico</th><th className="px-3 py-2 text-right font-semibold">Dif.</th></tr></thead>
                <tbody className="divide-y divide-red-200">
                  {discrepanciasResult.map((d, i) => (
                    <tr key={i}><td className="px-3 py-2 font-medium text-red-900">{d.medicamento_nombre}</td><td className="px-3 py-2 text-right">{d.cantidad_esperada}</td><td className="px-3 py-2 text-right font-bold">{d.cantidad_fisica}</td><td className="px-3 py-2 text-right font-bold">{d.diferencia > 0 ? `+${d.diferencia}` : d.diferencia}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2">
            {[
              { id: 'checkin', label: 'Checkin', icon: LogIn },
              { id: 'checkout', label: 'Checkout', icon: LogOut },
            ].map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                    activeTab === t.id ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}><Icon className="h-4 w-4" />{t.label}</button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Inventory Table */}
            <div className="lg:col-span-2 card p-0 overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Package className="h-5 w-5 text-blue-900" />Conteo Fisico — {selectedCaja.codigo}</h2>
                <span className="text-sm text-gray-400">{inventario.length} items</span>
              </div>
              <div className="overflow-x-auto">
                <table className="table-pro">
                  <thead><tr><th>Medicamento</th><th>Tipo</th><th>Lote</th><th className="text-right">Sistema</th><th className="text-right">Conteo</th><th className="text-center">Estado</th></tr></thead>
                  <tbody>
                    {inventario.map((item) => {
                      const fisico = conteoFisico[item.id] ?? item.cantidad;
                      const diff = fisico - item.cantidad;
                      const hasDiff = diff !== 0;
                      return (
                        <tr key={item.id} className={hasDiff ? 'bg-red-50' : ''}>
                          <td className="font-medium text-gray-900">{item.medicamento_nombre}</td>
                          <td><span className={`badge text-[10px] ${item.medicamento_tipo === 'NARCOTICO' ? 'bg-red-100 text-red-800' : item.medicamento_tipo === 'CONTROLADO' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{item.medicamento_tipo}</span></td>
                          <td className="text-gray-600">{item.lote || '—'}</td>
                          <td className="text-right font-semibold text-gray-700">{item.cantidad}</td>
                          <td className="text-right">
                            {activeTab !== 'historial' ? (
                              <input type="number" min="0" className={`w-20 text-right px-2 py-1 rounded-lg border text-sm font-semibold ${hasDiff ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200'}`} value={fisico} onChange={(e) => setConteoFisico({ ...conteoFisico, [item.id]: parseInt(e.target.value) || 0 })} />
                            ) : <span className="font-semibold">{fisico}</span>}
                          </td>
                          <td className="text-center">{hasDiff ? <span className="text-xs font-bold text-red-700 flex items-center justify-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{diff > 0 ? `+${diff}` : diff}</span> : <Check className="h-4 w-4 text-emerald-500 mx-auto" />}</td>
                        </tr>
                      );
                    })}
                    {inventario.length === 0 && <tr><td colSpan="6" className="text-center text-gray-400 py-10">No hay inventario</td></tr>}
                  </tbody>
                </table>
              </div>
              {conteoTieneDiferencias && activeTab !== 'historial' && (
                <div className="m-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800">Diferencias detectadas. Se generaran alertas al confirmar.</p>
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div className="space-y-6">
              {activeTab === 'checkin' && (
                <form onSubmit={handleCheckin} className="card space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><LogIn className="h-5 w-5 text-blue-900" />Checkin</h2>
                  <p className="text-xs text-gray-500">Recibir la caja.</p>

                  <div>
                    <label className="input-label">Responsable</label>
                    <input type="text" className="input-field bg-gray-50" value={`${user.first_name} ${user.last_name}`} disabled />
                  </div>

                  <SignaturePreview signatureKey="checkin_firma_origen" label="Su Firma" required />

                  <div>
                    <label className="input-label">Nombre de Quien Entrega (opcional)</label>
                    <input type="text" className="input-field" value={checkinForm.quien_entrega} onChange={(e) => setCheckinForm({ ...checkinForm, quien_entrega: e.target.value })} placeholder="Nombre de quien entrega la caja..." />
                  </div>

                  <div>
                    <label className="input-label">Turno *</label>
                    <select className="input-field" required value={checkinForm.turno} onChange={(e) => setCheckinForm({ ...checkinForm, turno: e.target.value })}>
                      <option value="">Seleccionar turno...</option>
                      {turnosConfig.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.hora_inicio} - {t.hora_fin})</option>)}
                    </select>
                  </div>

                  <SignaturePreview signatureKey="checkin_firma_testigo" label="Firma de Testigo" />

                  {isLateReturn(checkinForm.turno) && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
                      <div className="flex items-center gap-2 text-red-700 text-sm font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        Entrega fuera de horario
                      </div>
                      <p className="text-xs text-red-600">La hora de salida del turno seleccionado ya paso. Indique la razon de la entrega tardia.</p>
                      <textarea
                        className="input-field border-red-300"
                        rows="2"
                        required
                        value={checkinForm.razon_tardanza}
                        onChange={(e) => setCheckinForm({ ...checkinForm, razon_tardanza: e.target.value })}
                        placeholder="Razon de la entrega tardia..."
                      />
                    </div>
                  )}

                  <div>
                    <label className="input-label">Notas</label>
                    <textarea className="input-field" rows="2" value={checkinForm.notas} onChange={(e) => setCheckinForm({ ...checkinForm, notas: e.target.value })} placeholder="Observaciones..." />
                  </div>
                  <button type="submit" disabled={loading || !signatures.checkin_firma_origen || !checkinForm.turno || (isLateReturn(checkinForm.turno) && !checkinForm.razon_tardanza)} className="w-full btn-primary disabled:opacity-40">
                    <Lock className="h-4 w-4" />{loading ? 'Procesando...' : 'Confirmar Checkin'}
                  </button>
                </form>
              )}

              {activeTab === 'checkout' && (
                <form onSubmit={handleCheckout} className="card space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><LogOut className="h-5 w-5 text-blue-900" />Checkout</h2>
                  <p className="text-xs text-gray-500">Devolver la caja.</p>

                  <div>
                    <label className="input-label">Responsable</label>
                    <input type="text" className="input-field bg-gray-50" value={`${user.first_name} ${user.last_name}`} disabled />
                  </div>

                  <SignaturePreview signatureKey="checkout_firma_destino" label="Su Firma" required />

                  <div>
                    <label className="input-label">Nombre de Quien Entrega (opcional)</label>
                    <input type="text" className="input-field" value={checkoutForm.quien_entrega} onChange={(e) => setCheckoutForm({ ...checkoutForm, quien_entrega: e.target.value })} placeholder="Nombre de quien entrega..." />
                  </div>

                  <div>
                    <label className="input-label">Turno *</label>
                    <select className="input-field" required value={checkoutForm.turno} onChange={(e) => setCheckoutForm({ ...checkoutForm, turno: e.target.value })}>
                      <option value="">Seleccionar turno...</option>
                      {turnosConfig.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.hora_inicio} - {t.hora_fin})</option>)}
                    </select>
                  </div>

                  <SignaturePreview signatureKey="checkout_firma_testigo" label="Firma de Testigo" />

                  {isLateReturn(checkoutForm.turno) && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
                      <div className="flex items-center gap-2 text-red-700 text-sm font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        Entrega fuera de horario
                      </div>
                      <p className="text-xs text-red-600">La hora de salida del turno seleccionado ya paso. Indique la razon de la entrega tardia.</p>
                      <textarea
                        className="input-field border-red-300"
                        rows="2"
                        required
                        value={checkoutForm.razon_tardanza}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, razon_tardanza: e.target.value })}
                        placeholder="Razon de la entrega tardia..."
                      />
                    </div>
                  )}

                  <div>
                    <label className="input-label">Notas</label>
                    <textarea className="input-field" rows="2" value={checkoutForm.notas} onChange={(e) => setCheckoutForm({ ...checkoutForm, notas: e.target.value })} placeholder="Observaciones..." />
                  </div>
                  <button type="submit" disabled={loading || !signatures.checkout_firma_destino || !checkoutForm.turno || (isLateReturn(checkoutForm.turno) && !checkoutForm.razon_tardanza)} className="w-full btn-primary disabled:opacity-40">
                    <Lock className="h-4 w-4" />{loading ? 'Procesando...' : 'Confirmar Checkout'}
                  </button>
                </form>
              )}

              {activeTab === 'historial' && (
                <div className="card">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><History className="h-5 w-5 text-blue-900" />Historial</h2>
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {historial.map((entry) => (
                      <div key={entry.id} className={`border rounded-xl p-3 ${entry.discrepancias?.length > 0 ? 'border-red-200 bg-red-50/50' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${entry.tipo === 'CHECKOUT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{entry.tipo}</span>
                          <span className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString('es-MX')}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm mt-1">
                          <span className="text-gray-500">{entry.usuario_origen_nombre || '—'}</span>
                          <ArrowRight className="h-3 w-3 text-gray-400" />
                          <span className="font-medium text-gray-900">{entry.usuario_destino_nombre}</span>
                        </div>
                        {entry.discrepancias?.length > 0 && <div className="mt-2 text-xs text-red-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{entry.discrepancias.length} discrepancia(s)</div>}
                        {entry.notas && <p className="mt-1 text-xs text-gray-500 italic">{entry.notas}</p>}
                      </div>
                    ))}
                    {historial.length === 0 && <p className="text-center text-gray-400 py-8">Sin registros de custodia</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Signature Modal */}
      <SignatureModal
        isOpen={signatureModal.open}
        title={signatureModal.field?.includes('destino') ? 'Firma del Receptor' : signatureModal.field?.includes('origen') ? 'Firma del Entregante' : 'Firma Digital'}
        onSave={saveSignature}
        onCancel={() => setSignatureModal({ open: false, field: '', formType: '' })}
      />
    </div>
  );
};

export default CustodiaPage;
