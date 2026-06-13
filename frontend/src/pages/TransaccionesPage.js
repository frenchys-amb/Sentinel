import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useOffline } from '../hooks/useOffline';
import SignatureModal from '../components/SignatureModal';
import ScannerGS1 from '../components/ScannerGS1';
import { parsearGS1 } from '../utils/gs1';
import {
  Trash2, AlertTriangle, ArrowRightLeft,
  RotateCcw, Pill, Camera, CheckCircle, Hash, PenLine, PackagePlus, ScanLine
} from 'lucide-react';

const TransaccionesPage = ({ user }) => {
  const [activeTab, setActiveTab] = useState('ADMINISTRATION');
  const [medicamentos, setMedicamentos] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [transacciones, setTransacciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const { isOnline, queueForOffline } = useOffline();

  const [formData, setFormData] = useState({
    caja_origen: '', caja_destino: '', medicamento: '', cantidad: 1,
    lote: '', fecha_caducidad: '', testigo: '', motivo: '', ubicacion: '', paciente_id: '',
  });
  const [evidencia, setEvidencia] = useState([]);

  // Escaner GS1 DataMatrix
  const [showScanner, setShowScanner] = useState(false);
  const [scanInfo, setScanInfo] = useState({ status: '', mensaje: '' });

  // ADMIN: acceso al formulario de Recepcion/Compra desde el historial
  const [adminRecepcion, setAdminRecepcion] = useState(false);

  // Signatures
  const [signatureModal, setSignatureModal] = useState({ open: false, key: '', title: '' });
  const [signatures, setSignatures] = useState({
    firma_usuario: null,
    firma_testigo: null,
  });

  const tabs = [
    { id: 'ADMINISTRATION', label: 'Administracion', icon: Pill },
    { id: 'RECEIPT', label: 'Recepcion/Compra', icon: PackagePlus },
    { id: 'WASTE', label: 'Descarte', icon: Trash2 },
    { id: 'TRANSFER', label: 'Transferencia', icon: ArrowRightLeft },
    { id: 'RETURN', label: 'Devolucion', icon: RotateCcw },
    { id: 'DAMAGE', label: 'Dano/Incidencia', icon: AlertTriangle },
  ];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [medsRes, cajasRes, usersRes, transRes] = await Promise.all([
        api.get('/medicamentos/medicamentos/'),
        api.get('/medicamentos/cajas/'),
        api.get('/auth/usuarios/'),
        api.get('/transacciones/'),
      ]);
      setMedicamentos(medsRes.data.results || medsRes.data);
      setCajas(cajasRes.data.results || cajasRes.data);
      setUsuarios(usersRes.data.results || usersRes.data);
      setTransacciones(transRes.data.results || transRes.data);
    } catch (err) { console.error('Error cargando datos:', err); }
  };

  const resetForm = () => {
    setFormData({ caja_origen: '', caja_destino: '', medicamento: '', cantidad: 1, lote: '', fecha_caducidad: '', testigo: '', motivo: '', ubicacion: '', paciente_id: '' });
    setEvidencia([]);
    setSignatures({ firma_usuario: null, firma_testigo: null });
    setFormError('');
    setShowScanner(false);
    setScanInfo({ status: '', mensaje: '' });
  };

  const handleScan = (texto) => {
    const r = parsearGS1(texto);

    if (!r.esGS1) {
      // Codigo de barras simple: igualar contra codigo_barras del catalogo
      const med = medicamentos.find(m => m.codigo_barras && m.codigo_barras === r.crudo);
      if (med) {
        setFormData(prev => ({ ...prev, medicamento: String(med.id) }));
        setScanInfo({ status: 'ok', mensaje: `Escaneado: ${med.nombre} (codigo de barras). El lote y la fecha deben ingresarse manualmente.` });
        setShowScanner(false);
      } else {
        setScanInfo({ status: 'warn', mensaje: `El codigo leido no coincide con ningun medicamento del catalogo.` });
      }
      return;
    }

    // GS1: buscar el medicamento por NDC (las 3 normalizaciones posibles)
    const med = r.candidatosNdc.length
      ? medicamentos.find(m => m.ndc && r.candidatosNdc.includes(m.ndc))
      : null;

    const partes = [];
    if (r.lote) partes.push(`Lote: ${r.lote}`);
    if (r.fechaCaducidad) partes.push(`Vence: ${r.fechaCaducidad}`);

    setFormData(prev => ({
      ...prev,
      medicamento: med ? String(med.id) : prev.medicamento,
      lote: r.lote || prev.lote,
      fecha_caducidad: (activeTab === 'RECEIPT' && r.fechaCaducidad) ? r.fechaCaducidad : prev.fecha_caducidad,
    }));

    if (med) {
      setScanInfo({ status: 'ok', mensaje: `Escaneado: ${med.nombre} (NDC ${med.ndc_formateado || med.ndc})${partes.length ? ' · ' + partes.join(' · ') : ''}` });
    } else if (r.ndc10) {
      setScanInfo({ status: 'warn', mensaje: `El NDC escaneado (${r.ndc10}) no esta en el catalogo. Un administrador debe registrar el medicamento primero.${partes.length ? ' Datos leidos — ' + partes.join(' · ') : ''}` });
    } else {
      setScanInfo({ status: 'warn', mensaje: `Codigo GS1 leido sin NDC reconocible.${partes.length ? ' Datos leidos — ' + partes.join(' · ') : ''}` });
    }
    setShowScanner(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!signatures.firma_usuario) { setFormError('Debe firmar antes de registrar.'); return; }
    setLoading(true); setSuccess(''); setFormError('');
    const payload = {
      tipo: activeTab, ...formData,
      firma_usuario: 'FIRMA_DIGITAL_' + user.id,
      cantidad: parseInt(formData.cantidad),
      medicamento: parseInt(formData.medicamento),
      caja_origen: formData.caja_origen ? parseInt(formData.caja_origen) : null,
      caja_destino: formData.caja_destino ? parseInt(formData.caja_destino) : null,
      testigo: formData.testigo ? parseInt(formData.testigo) : null,
      fecha_caducidad: formData.fecha_caducidad || null,
      evidencia_urls: evidencia,
    };
    try {
      if (!isOnline) {
        queueForOffline({ url: '/transacciones/', method: 'post', data: payload });
        setSuccess('Guardada localmente. Se sincronizara al recuperar conexion.');
      } else {
        await api.post('/transacciones/', payload);
        setSuccess('Transaccion registrada exitosamente');
        fetchData();
      }
      resetForm();
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        const msg = typeof data === 'string' ? data : Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
        setFormError(msg);
      } else {
        setFormError('Error al registrar transaccion');
      }
    } finally { setLoading(false); }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    const urls = files.map((_, i) => `https://supabase.storage/evidencia_${Date.now()}_${i}.jpg`);
    setEvidencia([...evidencia, ...urls]);
  };

  const selectedMed = medicamentos.find(m => m.id === parseInt(formData.medicamento));
  const requiereTestigo = activeTab === 'WASTE' || selectedMed?.tipo === 'NARCOTICO' || selectedMed?.requiere_doble_factor;
  const esControlado = selectedMed?.tipo === 'NARCOTICO' || selectedMed?.tipo === 'CONTROLADO';
  const recepcionControlada = activeTab === 'RECEIPT' && esControlado;

  const tipoColors = {
    ADMINISTRATION: 'bg-blue-100 text-blue-800',
    RECEIPT: 'bg-teal-100 text-teal-800',
    WASTE: 'bg-red-100 text-red-800',
    TRANSFER: 'bg-purple-100 text-purple-800',
    RETURN: 'bg-emerald-100 text-emerald-800',
    DAMAGE: 'bg-amber-100 text-amber-800',
  };

  // ─── Signature Preview ───
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
            onClick={() => setSignatureModal({ open: true, key: sigKey, title: label })}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-700 transition-colors">
            <PenLine className="h-4 w-4" />
            Firmar
          </button>
        )}
      </div>
    );
  };

  // ─── ADMIN: historial + acceso a Recepcion/Compra ───
  if (user?.rol === 'ADMIN' && !adminRecepcion) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Historial de Transacciones</h1>
            <p className="text-gray-500 mt-1">Registro completo de movimientos de medicamentos</p>
          </div>
          <button
            onClick={() => { setAdminRecepcion(true); setActiveTab('RECEIPT'); resetForm(); }}
            className="btn-primary flex items-center gap-2 text-sm">
            <PackagePlus className="h-4 w-4" />
            Registrar Recepcion/Compra
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveTab('')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${!activeTab ? 'bg-blue-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Todos
          </button>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id ? 'bg-blue-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <Icon className="h-4 w-4" />{tab.label}
              </button>
            );
          })}
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              Transacciones ({(activeTab ? transacciones.filter(t => t.tipo === activeTab) : transacciones).length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table-pro">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Medicamento</th>
                  <th className="text-right">Cant.</th>
                  <th>Usuario</th>
                  <th>Testigo</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {(activeTab ? transacciones.filter(t => t.tipo === activeTab) : transacciones).map((t) => (
                  <tr key={t.id}>
                    <td className="text-xs text-gray-500 whitespace-nowrap">{new Date(t.timestamp).toLocaleString('es-PR')}</td>
                    <td><span className={`badge ${tipoColors[t.tipo] || 'bg-gray-100 text-gray-700'} text-[10px]`}>{t.tipo}</span></td>
                    <td className="font-medium text-gray-900">{t.medicamento_nombre}</td>
                    <td className="text-right font-semibold">{t.cantidad}</td>
                    <td className="text-sm text-gray-700">{t.usuario_nombre}</td>
                    <td className="text-sm text-gray-500">{t.testigo_nombre || '—'}</td>
                    <td><span className="flex items-center gap-1 text-[10px] font-mono text-gray-400"><Hash className="h-3 w-3" />{t.hash_transaccion?.substring(0, 10)}</span></td>
                  </tr>
                ))}
                {transacciones.length === 0 && (
                  <tr><td colSpan="7" className="text-center text-gray-400 py-12">No hay transacciones registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ─── PARAMEDICO: formulario completo + historial (ADMIN: solo Recepcion/Compra) ───
  const tabsVisibles = user?.rol === 'ADMIN' ? tabs.filter(t => t.id === 'RECEIPT') : tabs;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{user?.rol === 'ADMIN' ? 'Recepcion / Compra' : 'Transacciones'}</h1>
          <p className="text-gray-500 mt-1">{user?.rol === 'ADMIN' ? 'Registro de entrada de medicamentos comprados' : 'Registro de movimientos de medicamentos'}</p>
        </div>
        {user?.rol === 'ADMIN' && (
          <button onClick={() => { setAdminRecepcion(false); setActiveTab(''); resetForm(); }} className="btn-secondary text-sm">
            ← Volver al historial
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabsVisibles.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); resetForm(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-blue-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle className="h-4 w-4" />{success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
            {React.createElement(tabs.find(t => t.id === activeTab)?.icon, { className: 'h-5 w-5 text-blue-900' })}
            {tabs.find(t => t.id === activeTab)?.label}
          </h3>

          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertTriangle className="h-4 w-4 shrink-0" />{formError}
            </div>
          )}

          {activeTab === 'WASTE' && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-900 mb-4">
              Este proceso sigue el{' '}
              <Link to="/protocolos" className="font-semibold underline hover:text-blue-700">
                Protocolo de Eliminacion de Medicamentos Controlados
              </Link>{' '}
              (sistema Deterra · dos personas autorizadas · doble firma).
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {user?.rol === 'PARAMEDICO' && (
              <div>
                <label className="input-label">Responsable</label>
                <input type="text" className="input-field bg-gray-100" value={`${user.first_name} ${user.last_name}`} disabled />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="input-label mb-0">Medicamento *</label>
                <button type="button" onClick={() => { setShowScanner(!showScanner); setScanInfo({ status: '', mensaje: '' }); }}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-900 hover:text-blue-700 transition-colors">
                  <ScanLine className="h-3.5 w-3.5" />
                  {showScanner ? 'Cerrar escaner' : 'Escanear empaque'}
                </button>
              </div>
              <select className="input-field" value={formData.medicamento} onChange={(e) => setFormData({...formData, medicamento: e.target.value})} required>
                <option value="">Seleccionar...</option>
                {medicamentos.map((med) => (
                  <option key={med.id} value={med.id}>{med.nombre} {med.concentracion} ({med.tipo})</option>
                ))}
              </select>
            </div>

            {showScanner && (
              <ScannerGS1 onScan={handleScan} onClose={() => setShowScanner(false)} />
            )}

            {scanInfo.mensaje && (
              <div className={`p-3 rounded-xl border text-sm ${scanInfo.status === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                {scanInfo.mensaje}
              </div>
            )}

            {activeTab === 'RECEIPT' && selectedMed && (
              <div className={`p-3 rounded-xl border text-sm ${selectedMed.ndc ? 'bg-teal-50 border-teal-200 text-teal-800' : esControlado ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                {selectedMed.ndc
                  ? <>NDC: <span className="font-mono font-semibold">{selectedMed.ndc_formateado || selectedMed.ndc}</span>{selectedMed.dea_schedule && ` · Schedule ${selectedMed.dea_schedule}`}</>
                  : esControlado
                    ? 'Este medicamento no tiene NDC registrado. Un administrador debe agregarlo en el catalogo antes de poder recibirlo.'
                    : 'Sin NDC registrado (no requerido para medicamentos generales).'}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Cantidad *</label>
                <input type="number" min="1" className="input-field" value={formData.cantidad} onChange={(e) => setFormData({...formData, cantidad: e.target.value})} required />
              </div>
              <div>
                <label className="input-label">Lote {recepcionControlada && <span className="text-red-600">*</span>}</label>
                <input type="text" className="input-field" value={formData.lote} onChange={(e) => setFormData({...formData, lote: e.target.value})} required={recepcionControlada} placeholder={activeTab === 'RECEIPT' ? 'Como aparece en el empaque' : ''} />
              </div>
            </div>

            {activeTab === 'RECEIPT' && (
              <div>
                <label className="input-label">Fecha de expiracion {recepcionControlada && <span className="text-red-600">*</span>}</label>
                <input type="date" className="input-field" value={formData.fecha_caducidad} onChange={(e) => setFormData({...formData, fecha_caducidad: e.target.value})} required={recepcionControlada} min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} />
                {recepcionControlada && <p className="text-xs text-amber-600 mt-1.5">NDC + lote + fecha de expiracion son obligatorios al recibir narcoticos y controlados.</p>}
              </div>
            )}

            {['ADMINISTRATION','WASTE','DAMAGE','TRANSFER'].includes(activeTab) && (
              <div>
                <label className="input-label">Caja Origen *</label>
                <select className="input-field" value={formData.caja_origen} onChange={(e) => setFormData({...formData, caja_origen: e.target.value})} required>
                  <option value="">Seleccionar...</option>
                  {cajas.map((c) => <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>)}
                </select>
              </div>
            )}

            {['RECEIPT','PICKUP','RETURN','TRANSFER'].includes(activeTab) && (
              <div>
                <label className="input-label">Caja Destino *</label>
                <select className="input-field" value={formData.caja_destino} onChange={(e) => setFormData({...formData, caja_destino: e.target.value})} required>
                  <option value="">Seleccionar...</option>
                  {cajas.map((c) => <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>)}
                </select>
              </div>
            )}

            {activeTab === 'ADMINISTRATION' && (
              <div>
                <label className="input-label">ID Paciente</label>
                <input type="text" className="input-field" value={formData.paciente_id} onChange={(e) => setFormData({...formData, paciente_id: e.target.value})} placeholder="ID anonimo del paciente" />
              </div>
            )}

            <div>
              <label className="input-label">Motivo / Descripcion</label>
              <textarea className="input-field" rows="2" value={formData.motivo} onChange={(e) => setFormData({...formData, motivo: e.target.value})} placeholder={activeTab === 'WASTE' ? 'Motivo del descarte...' : 'Motivo...'} />
            </div>

            {activeTab === 'DAMAGE' && (
              <div>
                <label className="input-label">Ubicacion</label>
                <input type="text" className="input-field" value={formData.ubicacion} onChange={(e) => setFormData({...formData, ubicacion: e.target.value})} placeholder="Donde ocurrio?" />
              </div>
            )}

            {requiereTestigo && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <div>
                  <label className="input-label text-amber-700">
                    Testigo Obligatorio {activeTab === 'WASTE' && <span className="text-red-600">*</span>}
                  </label>
                  <select className="input-field border-amber-300" value={formData.testigo} onChange={(e) => setFormData({...formData, testigo: e.target.value})} required={activeTab === 'WASTE'}>
                    <option value="">Seleccionar testigo...</option>
                    {usuarios.filter(u => u.id !== user.id).map((u) => (
                      <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                    ))}
                  </select>
                  {activeTab === 'WASTE' && <p className="text-xs text-amber-600 mt-1.5">Sin testigo, no hay descarte.</p>}
                </div>

                {/* Firma del testigo */}
                <SignaturePreview sigKey="firma_testigo" label="Firma del Testigo" />
              </div>
            )}

            {activeTab === 'DAMAGE' && (
              <div>
                <label className="input-label">Evidencia Fotografica</label>
                <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors text-sm text-gray-600">
                  <Camera className="h-4 w-4" />
                  <span>Subir fotos</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                </label>
                {evidencia.length > 0 && <p className="text-xs text-gray-500 mt-1">{evidencia.length} archivo(s)</p>}
              </div>
            )}

            {/* Firma del usuario — siempre visible */}
            <SignaturePreview sigKey="firma_usuario" label="Firma Digital" required />

            <button type="submit"
              disabled={loading || !signatures.firma_usuario || (requiereTestigo && activeTab === 'WASTE' && !formData.testigo) || (recepcionControlada && !selectedMed?.ndc)}
              className="w-full btn-primary disabled:opacity-40 py-3">
              {loading ? 'Registrando...' : isOnline ? 'Registrar Transaccion' : 'Guardar Localmente'}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-5">Historial Reciente</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {transacciones.slice(0, 20).map((t) => (
              <div key={t.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${tipoColors[t.tipo] || 'bg-gray-100 text-gray-700'} text-[10px]`}>{t.tipo}</span>
                    <span className="text-xs text-gray-400">{new Date(t.timestamp).toLocaleString('es-PR')}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
                    <Hash className="h-3 w-3" />
                    {t.hash_transaccion?.substring(0, 10)}
                  </span>
                </div>
                <p className="text-sm text-gray-900">
                  <strong>{t.medicamento_nombre}</strong> <span className="text-gray-400">x</span> {t.cantidad}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Por: {t.usuario_nombre} {t.testigo_nombre && ` · Testigo: ${t.testigo_nombre}`}
                </p>
              </div>
            ))}
            {transacciones.length === 0 && (
              <p className="text-center text-gray-400 py-12">No hay transacciones registradas</p>
            )}
          </div>
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

export default TransaccionesPage;
