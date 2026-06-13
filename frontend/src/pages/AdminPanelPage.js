import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ScannerGS1 from '../components/ScannerGS1';
import { parsearGS1 } from '../utils/gs1';
import {
  Users, Package, Compass, Pill, Plus, Edit2, Check, X,
  AlertCircle, ShieldCheck, Trash2, Power, Eye, EyeOff, Lock, Unlock, Clock, Building2, ScanLine
} from 'lucide-react';

const AdminPanelPage = ({ user }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [usersList, setUsersList] = useState([]);
  const [boxesList, setBoxesList] = useState([]);
  const [unitsList, setUnitsList] = useState([]);
  const [medsList, setMedsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, type: '', id: null });

  const [userForm, setUserForm] = useState({ username: '', first_name: '', last_name: '', email: '', password: '', rol: 'PARAMEDICO', numero_licencia: '', fecha_vencimiento_licencia: '', telefono: '', activo: true });
  const [boxForm, setBoxForm] = useState({ codigo: '', nombre: '', ubicacion: '', unidad: '', estado: 'ACTIVA', base: '' });
  const [unitForm, setUnitForm] = useState({ nombre: '', descripcion: '', activa: true });
  const [medForm, setMedForm] = useState({ nombre: '', principio_activo: '', concentracion: '', presentacion: '', tipo: 'GENERAL', ndc: '', dea_schedule: '', codigo_barras: '', requiere_doble_factor: false, temperatura_conservacion: '', activo: true });
  const [ndcCheck, setNdcCheck] = useState({ status: '', mensaje: '' });
  const [showMedScanner, setShowMedScanner] = useState(false);
  const [turnosList, setTurnosList] = useState([]);
  const [turnoForm, setTurnoForm] = useState({ nombre: '', hora_inicio: '07:00', hora_fin: '19:00' });
  const [basesList, setBasesList] = useState([]);
  const [baseForm, setBaseForm] = useState({ nombre: '', direccion: '', descripcion: '' });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [activeTab]);

  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      if (activeTab === 'users') {
        const res = await api.get('/auth/usuarios/');
        setUsersList(res.data.results || res.data);
        const unitsRes = await api.get('/unidades/');
        setUnitsList(unitsRes.data.results || unitsRes.data);
      } else if (activeTab === 'boxes') {
        const [boxesRes, unitsRes, basesRes] = await Promise.all([api.get('/medicamentos/cajas/'), api.get('/unidades/'), api.get('/bases/')]);
        setBoxesList(boxesRes.data.results || boxesRes.data);
        setUnitsList(unitsRes.data.results || unitsRes.data);
        setBasesList(basesRes.data.results || basesRes.data);
      } else if (activeTab === 'units') {
        const res = await api.get('/unidades/');
        setUnitsList(res.data.results || res.data);
      } else if (activeTab === 'meds') {
        const res = await api.get('/medicamentos/medicamentos/');
        setMedsList(res.data.results || res.data);
      } else if (activeTab === 'turnos') {
        const res = await api.get('/turnos-config/');
        setTurnosList(res.data.results || res.data);
      } else if (activeTab === 'bases') {
        const res = await api.get('/bases/');
        setBasesList(res.data.results || res.data);
      }
    } catch (err) { setError('Error al cargar datos'); }
    finally { setLoading(false); }
  };

  const handleTabChange = (tab) => { setActiveTab(tab); setEditingId(null); setShowFormModal(false); resetForms(); };

  const resetForms = () => {
    setUserForm({ username: '', first_name: '', last_name: '', email: '', password: '', rol: 'PARAMEDICO', numero_licencia: '', fecha_vencimiento_licencia: '', telefono: '', activo: true });
    setBoxForm({ codigo: '', nombre: '', ubicacion: '', unidad: '', estado: 'ACTIVA', base: '' });
    setUnitForm({ nombre: '', descripcion: '', activa: true });
    setMedForm({ nombre: '', principio_activo: '', concentracion: '', presentacion: '', tipo: 'GENERAL', ndc: '', dea_schedule: '', codigo_barras: '', requiere_doble_factor: false, temperatura_conservacion: '', activo: true });
    setTurnoForm({ nombre: '', hora_inicio: '07:00', hora_fin: '19:00' });
    setBaseForm({ nombre: '', direccion: '', descripcion: '' });
    setNdcCheck({ status: '', mensaje: '' });
    setShowMedScanner(false);
    setError(''); setSuccess(''); setShowPassword(false);
  };

  const openCreate = () => { setEditingId(null); resetForms(); setShowFormModal(true); };
  const closeModal = () => { setShowFormModal(false); setEditingId(null); resetForms(); };

  // ─── Handlers ───
  const handleUserSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('');
    try {
      const payload = { ...userForm };
      if (editingId && !payload.password) delete payload.password;
      if (!payload.fecha_vencimiento_licencia) payload.fecha_vencimiento_licencia = null;
      if (editingId) { await api.patch(`/auth/usuarios/${editingId}/`, payload); setSuccess('Usuario actualizado'); }
      else { if (!payload.password) throw new Error('Contrasena obligatoria'); await api.post('/auth/usuarios/', payload); setSuccess('Usuario creado'); }
      closeModal(); fetchData();
    } catch (err) { setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : err.message); }
    finally { setLoading(false); }
  };

  const handleEditUser = (u) => {
    setEditingId(u.id);
    setUserForm({ username: u.username, first_name: u.first_name || '', last_name: u.last_name || '', email: u.email || '', password: '', rol: u.rol || 'PARAMEDICO', numero_licencia: u.numero_licencia || '', fecha_vencimiento_licencia: u.fecha_vencimiento_licencia || '', telefono: u.telefono || '', activo: u.activo });
    setShowFormModal(true);
  };
  const handleToggleUserActive = async (u) => { try { await api.patch(`/auth/usuarios/${u.id}/`, { activo: !u.activo }); setSuccess(`Usuario ${u.activo ? 'desactivado' : 'activado'}`); fetchData(); } catch { setError('Error'); } };
  const handleUnblockUser = async (u) => { try { await api.post(`/auth/usuarios/${u.id}/desbloquear/`); setSuccess(`Usuario ${u.username} desbloqueado`); fetchData(); } catch { setError('Error al desbloquear'); } };

  const handleBoxSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('');
    try {
      const payload = { ...boxForm, base: boxForm.base ? parseInt(boxForm.base) : null };
      if (editingId) { await api.put(`/medicamentos/cajas/${editingId}/`, payload); setSuccess('Caja actualizada'); }
      else { await api.post('/medicamentos/cajas/', payload); setSuccess('Caja creada'); }
      closeModal(); fetchData();
    } catch (err) { setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : err.message); }
    finally { setLoading(false); }
  };

  const handleEditBox = (b) => {
    setEditingId(b.id);
    setBoxForm({ codigo: b.codigo, nombre: b.nombre, ubicacion: b.ubicacion || '', unidad: b.unidad || '', estado: b.estado || 'ACTIVA', base: b.base ? b.base.toString() : '' });
    setShowFormModal(true);
  };
  const handleDeleteBox = async (id) => { try { await api.delete(`/medicamentos/cajas/${id}/`); setSuccess('Caja eliminada'); fetchData(); } catch { setError('No se puede eliminar'); } };

  const handleUnitSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('');
    try {
      if (editingId) { await api.put(`/unidades/${editingId}/`, unitForm); setSuccess('Unidad actualizada'); }
      else { await api.post('/unidades/', unitForm); setSuccess('Unidad creada'); }
      closeModal(); fetchData();
    } catch (err) { setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : err.message); }
    finally { setLoading(false); }
  };

  const handleEditUnit = (un) => { setEditingId(un.id); setUnitForm({ nombre: un.nombre, descripcion: un.descripcion || '', activa: un.activa }); setShowFormModal(true); };
  const handleDeleteUnit = async (id) => { try { await api.delete(`/unidades/${id}/`); setSuccess('Unidad eliminada'); fetchData(); } catch { setError('Error al eliminar'); } };

  const handleMedSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('');
    try {
      const payload = { ...medForm, ndc: medForm.ndc || null, codigo_barras: medForm.codigo_barras || null, requiere_doble_factor: medForm.tipo === 'NARCOTICO' ? true : medForm.requiere_doble_factor };
      if (editingId) { await api.put(`/medicamentos/medicamentos/${editingId}/`, payload); setSuccess('Medicamento actualizado'); }
      else { await api.post('/medicamentos/medicamentos/', payload); setSuccess('Medicamento creado'); }
      closeModal(); fetchData();
    } catch (err) { setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : err.message); }
    finally { setLoading(false); }
  };

  // Autocompletar solo los campos vacíos — no pisar lo que el admin ya escribió
  const aplicarResultadoFda = (d, prefijo = 'Verificado FDA') => {
    setMedForm(prev => ({
      ...prev,
      ndc: d.ndc_formateado || prev.ndc,
      nombre: prev.nombre || d.nombre,
      principio_activo: prev.principio_activo || d.principio_activo,
      concentracion: prev.concentracion || d.concentracion,
      presentacion: prev.presentacion || d.presentacion,
      dea_schedule: d.dea_schedule || prev.dea_schedule,
      tipo: prev.tipo === 'GENERAL' ? d.tipo_sugerido : prev.tipo,
      requiere_doble_factor: d.tipo_sugerido === 'NARCOTICO' ? true : prev.requiere_doble_factor,
    }));
    setNdcCheck({ status: 'found', mensaje: `${prefijo}: ${d.nombre} — ${d.fabricante}${d.dea_schedule ? ` (Schedule ${d.dea_schedule})` : ''}` });
  };

  const handleVerifyNdc = async () => {
    if (!medForm.ndc) return;
    setNdcCheck({ status: 'loading', mensaje: 'Consultando el directorio de la FDA...' });
    try {
      const res = await api.get('/medicamentos/medicamentos/ndc-lookup/', { params: { ndc: medForm.ndc } });
      const d = res.data;
      if (d.encontrado) {
        aplicarResultadoFda(d);
      } else {
        setNdcCheck({ status: 'notfound', mensaje: d.mensaje });
      }
    } catch (err) {
      const d = err.response?.data;
      if (err.response?.status === 503) {
        setNdcCheck({ status: 'offline', mensaje: d?.mensaje || 'Directorio FDA no disponible. El NDC puede registrarse y verificarse despues.' });
      } else {
        setNdcCheck({ status: 'invalid', mensaje: d?.ndc || 'No se pudo verificar el NDC.' });
      }
    }
  };

  const handleMedScan = async (texto) => {
    const r = parsearGS1(texto);
    setShowMedScanner(false);
    if (!r.esGS1 || !r.candidatosNdc?.length) {
      setNdcCheck({ status: 'invalid', mensaje: 'El codigo escaneado no contiene un NDC. Usa el DataMatrix del empaque del medicamento.' });
      return;
    }
    setNdcCheck({ status: 'loading', mensaje: 'NDC escaneado — consultando el directorio de la FDA...' });
    // El NDC del GTIN tiene 3 normalizaciones posibles: probar hasta dar con la registrada en FDA
    for (const candidato of r.candidatosNdc) {
      try {
        const res = await api.get('/medicamentos/medicamentos/ndc-lookup/', { params: { ndc: candidato } });
        if (res.data.encontrado) {
          aplicarResultadoFda(res.data, 'Escaneado y verificado FDA');
          return;
        }
      } catch (err) {
        if (err.response?.status === 503) {
          setMedForm(prev => ({ ...prev, ndc: candidato }));
          setNdcCheck({ status: 'offline', mensaje: 'NDC escaneado, pero el directorio FDA no esta disponible. Completa los datos manualmente y verifica despues.' });
          return;
        }
      }
    }
    setMedForm(prev => ({ ...prev, ndc: r.candidatosNdc[0] }));
    setNdcCheck({ status: 'notfound', mensaje: 'El NDC escaneado no aparece en el directorio de la FDA. Revisa el numero impreso en el empaque.' });
  };

  const handleEditMed = (med) => {
    setEditingId(med.id);
    setMedForm({ nombre: med.nombre || '', principio_activo: med.principio_activo || '', concentracion: med.concentracion || '', presentacion: med.presentacion || '', tipo: med.tipo || 'GENERAL', ndc: med.ndc || '', dea_schedule: med.dea_schedule || '', codigo_barras: med.codigo_barras || '', requiere_doble_factor: med.requiere_doble_factor || false, temperatura_conservacion: med.temperatura_conservacion || '', activo: med.activo });
    setShowFormModal(true);
  };
  const handleToggleMedActive = async (med) => { try { await api.patch(`/medicamentos/medicamentos/${med.id}/`, { activo: !med.activo }); setSuccess(`Medicamento ${med.activo ? 'desactivado' : 'activado'}`); fetchData(); } catch { setError('Error'); } };

  const handleTurnoSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/turnos-config/', {
        nombre: turnoForm.nombre,
        hora_inicio: turnoForm.hora_inicio,
        hora_fin: turnoForm.hora_fin,
      });
      setSuccess('Turno creado exitosamente');
      closeModal(); fetchData();
    } catch (err) { setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Error al crear turno'); }
    finally { setLoading(false); }
  };

  const handleDeleteTurno = async (id) => {
    try {
      await api.delete(`/turnos-config/${id}/`);
      setSuccess('Turno eliminado');
      fetchData();
    } catch (err) { setError('Error al eliminar turno'); }
  };

  const handleBaseSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('');
    try {
      if (editingId) { await api.put(`/bases/${editingId}/`, baseForm); setSuccess('Base actualizada'); }
      else { await api.post('/bases/', baseForm); setSuccess('Base creada'); }
      closeModal(); fetchData();
    } catch (err) { setError(err.response?.data ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Error al guardar base'); }
    finally { setLoading(false); }
  };

  const handleEditBase = (b) => { setEditingId(b.id); setBaseForm({ nombre: b.nombre, direccion: b.direccion || '', descripcion: b.descripcion || '' }); setShowFormModal(true); };
  const handleDeleteBase = async (id) => { try { await api.delete(`/bases/${id}/`); setSuccess('Base eliminada'); fetchData(); } catch { setError('Error al eliminar base'); } };

  const tabConfig = [
    { id: 'users', label: 'Usuarios', icon: Users },
    { id: 'boxes', label: 'Cajas', icon: Package },
    { id: 'meds', label: 'Medicamentos', icon: Pill },
    { id: 'units', label: 'Unidades', icon: Compass },
    { id: 'turnos', label: 'Turnos', icon: Clock },
    { id: 'bases', label: 'Bases', icon: Building2 },
  ];

  const tabLabels = { users: 'Usuario', boxes: 'Caja', meds: 'Medicamento', units: 'Unidad', turnos: 'Turno', bases: 'Base' };
  const modalTitle = editingId
    ? `Editar ${tabLabels[activeTab] || ''}`
    : `Crear ${tabLabels[activeTab] || ''}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de Administracion</h1>
          <p className="text-gray-500 mt-1">Gestion de Usuarios, Cajas, Unidades y Medicamentos</p>
        </div>
        <div className="badge bg-amber-100 text-amber-800"><ShieldCheck className="h-3.5 w-3.5" />ADMIN</div>
      </div>

      {/* Tabs + Create Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
          {tabConfig.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
                  activeTab === tab.id ? 'bg-blue-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                }`}>
                <Icon className="h-4 w-4" /><span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="h-4 w-4" />
          Crear {tabLabels[activeTab] || ''}
        </button>
      </div>

      {/* Feedback */}
      {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"><AlertCircle className="h-4 w-4 shrink-0" /><div>{error}</div></div>}
      {success && <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm"><Check className="h-4 w-4 shrink-0" /><div>{success}</div></div>}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {activeTab === 'users' && `Usuarios (${usersList.length})`}
            {activeTab === 'boxes' && `Cajas (${boxesList.length})`}
            {activeTab === 'meds' && `Medicamentos (${medsList.length})`}
            {activeTab === 'units' && `Unidades (${unitsList.length})`}
            {activeTab === 'turnos' && `Turnos (${turnosList.length})`}
            {activeTab === 'bases' && `Bases (${basesList.length})`}
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-900" /></div>
        ) : (
          <div className="overflow-x-auto">
            {activeTab === 'users' && (
              <table className="table-pro">
                <thead><tr><th>Usuario</th><th>Rol</th><th>Licencia</th><th className="text-center">Estado</th><th className="text-right">Acciones</th></tr></thead>
                <tbody>
                  {usersList.map(u => (
                    <tr key={u.id}>
                      <td><div className="font-medium text-gray-900">{u.first_name} {u.last_name}</div><div className="text-xs text-gray-500">@{u.username} · {u.email}</div></td>
                      <td><span className={`badge text-[10px] ${u.rol === 'ADMIN' ? 'bg-blue-100 text-blue-800' : u.rol === 'AUDITOR' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{u.rol}</span></td>
                      <td>{u.rol === 'PARAMEDICO' ? (<div className="text-gray-700 text-sm">Lic: {u.numero_licencia || 'N/A'}</div>) : <span className="text-gray-400">—</span>}</td>
                      <td className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button onClick={() => handleToggleUserActive(u)} className={`p-1.5 rounded-lg transition-colors ${u.activo ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}><Power className="h-4 w-4" /></button>
                          {u.esta_bloqueado && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              <Lock className="h-3 w-3" /> Bloqueado
                            </span>
                          )}
                          {!u.esta_bloqueado && u.intentos_fallidos > 0 && (
                            <span className="text-[10px] text-amber-600">{u.intentos_fallidos}/3 intentos</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right space-x-1">
                        {u.esta_bloqueado && (
                          <button onClick={() => handleUnblockUser(u)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="Desbloquear usuario"><Unlock className="h-4 w-4" /></button>
                        )}
                        <button onClick={() => handleEditUser(u)} className="p-1.5 text-blue-900 hover:bg-blue-50 rounded-lg"><Edit2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {usersList.length === 0 && <tr><td colSpan="5" className="text-center text-gray-400 py-12">No hay usuarios</td></tr>}
                </tbody>
              </table>
            )}

            {activeTab === 'boxes' && (
              <table className="table-pro">
                <thead><tr><th>Codigo / Nombre</th><th>Ubicacion / Unidad</th><th>Base</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
                <tbody>
                  {boxesList.map(b => (
                    <tr key={b.id}>
                      <td><div className="font-medium text-gray-900">{b.codigo}</div><div className="text-xs text-gray-500">{b.nombre}</div></td>
                      <td><div className="text-gray-700 text-sm">{b.unidad || 'Sin unidad'}</div><div className="text-xs text-gray-500">{b.ubicacion || '—'}</div></td>
                      <td className="text-gray-700 text-sm">{b.base_nombre || 'Sin base'}</td>
                      <td><span className={`badge text-[10px] ${b.estado === 'ACTIVA' ? 'bg-emerald-100 text-emerald-800' : b.estado === 'EXTRAVIADA' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>{b.estado}</span></td>
                      <td className="text-right space-x-1">
                        <button onClick={() => handleEditBox(b)} className="p-1.5 text-blue-900 hover:bg-blue-50 rounded-lg"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteModal({ open: true, type: 'box', id: b.id })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {boxesList.length === 0 && <tr><td colSpan="5" className="text-center text-gray-400 py-12">No hay cajas</td></tr>}
                </tbody>
              </table>
            )}

            {activeTab === 'meds' && (
              <table className="table-pro">
                <thead><tr><th>Medicamento</th><th>Tipo</th><th>NDC</th><th>Presentacion</th><th>Seguridad</th><th className="text-center">Activo</th><th className="text-right">Acciones</th></tr></thead>
                <tbody>
                  {medsList.map(med => (
                    <tr key={med.id}>
                      <td><div className="font-medium text-gray-900">{med.nombre}</div><div className="text-xs text-gray-500">{med.principio_activo}</div></td>
                      <td><span className={`badge text-[10px] ${med.tipo === 'NARCOTICO' ? 'bg-red-100 text-red-800' : med.tipo === 'CONTROLADO' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{med.tipo}</span></td>
                      <td><div className="text-gray-700 text-sm font-mono">{med.ndc_formateado || '—'}</div>{med.dea_schedule && <div className="text-xs text-gray-500">Schedule {med.dea_schedule}</div>}</td>
                      <td><div className="text-gray-700 text-sm">{med.concentracion}</div><div className="text-xs text-gray-500">{med.presentacion}</div></td>
                      <td><div className="text-gray-700 text-sm">{med.requiere_doble_factor ? 'Testigo req.' : 'Firma simple'}</div></td>
                      <td className="text-center"><button onClick={() => handleToggleMedActive(med)} className={`p-1.5 rounded-lg transition-colors ${med.activo ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}><Power className="h-4 w-4" /></button></td>
                      <td className="text-right"><button onClick={() => handleEditMed(med)} className="p-1.5 text-blue-900 hover:bg-blue-50 rounded-lg"><Edit2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                  {medsList.length === 0 && <tr><td colSpan="7" className="text-center text-gray-400 py-12">No hay medicamentos</td></tr>}
                </tbody>
              </table>
            )}

            {activeTab === 'units' && (
              <table className="table-pro">
                <thead><tr><th>Nombre</th><th>Descripcion</th><th className="text-center">Estado</th><th className="text-right">Acciones</th></tr></thead>
                <tbody>
                  {unitsList.map(un => (
                    <tr key={un.id}>
                      <td className="font-medium text-gray-900">{un.nombre}</td>
                      <td className="text-gray-500 max-w-xs truncate">{un.descripcion || '—'}</td>
                      <td className="text-center"><span className={`badge text-[10px] ${un.activa ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{un.activa ? 'Activa' : 'Inactiva'}</span></td>
                      <td className="text-right space-x-1">
                        <button onClick={() => handleEditUnit(un)} className="p-1.5 text-blue-900 hover:bg-blue-50 rounded-lg"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteModal({ open: true, type: 'unit', id: un.id })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {unitsList.length === 0 && <tr><td colSpan="4" className="text-center text-gray-400 py-12">No hay unidades</td></tr>}
                </tbody>
              </table>
            )}

            {activeTab === 'turnos' && (
              <table className="table-pro">
                <thead><tr><th>Nombre del Turno</th><th>Hora Inicio</th><th>Hora Fin</th><th className="text-right">Acciones</th></tr></thead>
                <tbody>
                  {turnosList.map(t => (
                    <tr key={t.id}>
                      <td className="font-medium text-gray-900">{t.nombre}</td>
                      <td className="text-gray-700">{t.hora_inicio}</td>
                      <td className="text-gray-700">{t.hora_fin}</td>
                      <td className="text-right space-x-1">
                        <button onClick={() => setDeleteModal({ open: true, type: 'turno', id: t.id })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {turnosList.length === 0 && <tr><td colSpan="4" className="text-center text-gray-400 py-12">No hay turnos creados</td></tr>}
                </tbody>
              </table>
            )}

            {activeTab === 'bases' && (
              <table className="table-pro">
                <thead><tr><th>Nombre</th><th>Direccion</th><th>Descripcion</th><th className="text-right">Acciones</th></tr></thead>
                <tbody>
                  {basesList.map(b => (
                    <tr key={b.id}>
                      <td className="font-medium text-gray-900">{b.nombre}</td>
                      <td className="text-gray-700">{b.direccion || '—'}</td>
                      <td className="text-gray-500 max-w-xs truncate">{b.descripcion || '—'}</td>
                      <td className="text-right space-x-1">
                        <button onClick={() => handleEditBase(b)} className="p-1.5 text-blue-900 hover:bg-blue-50 rounded-lg"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteModal({ open: true, type: 'base', id: b.id })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {basesList.length === 0 && <tr><td colSpan="4" className="text-center text-gray-400 py-12">No hay bases creadas</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ═══ CREATE/EDIT MODAL ═══ */}
      {showFormModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-content w-full max-w-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{modalTitle}</h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-6">
              {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

              {/* Users Form */}
              {activeTab === 'users' && (
                <form onSubmit={handleUserSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Nombre *</label><input type="text" required className="input-field" value={userForm.first_name} onChange={e => setUserForm({...userForm, first_name: e.target.value})} /></div>
                    <div><label className="input-label">Apellidos *</label><input type="text" required className="input-field" value={userForm.last_name} onChange={e => setUserForm({...userForm, last_name: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Username *</label><input type="text" required className="input-field" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} placeholder="j.perez" /></div>
                    <div><label className="input-label">Email *</label><input type="email" required className="input-field" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} /></div>
                  </div>
                  <div>
                    <label className="input-label">Contrasena {editingId ? '(vacio = sin cambio)' : '*'}</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} required={!editingId} className="input-field pr-10" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} placeholder={editingId ? 'Sin cambios' : 'Min 12 caracteres'} minLength={editingId ? 0 : 12} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Rol *</label><select className="input-field" value={userForm.rol} onChange={e => setUserForm({...userForm, rol: e.target.value})}><option value="PARAMEDICO">Paramedico</option><option value="ADMIN">Admin</option><option value="AUDITOR">Auditor</option></select></div>
                    <div><label className="input-label">Telefono</label><input type="text" className="input-field" value={userForm.telefono} onChange={e => setUserForm({...userForm, telefono: e.target.value})} /></div>
                  </div>
                  {userForm.rol === 'PARAMEDICO' && (
                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                      <p className="text-xs font-semibold text-blue-800 uppercase">Datos de Paramedico</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="input-label text-blue-800">Licencia *</label><input type="text" required className="input-field border-blue-200" value={userForm.numero_licencia} onChange={e => setUserForm({...userForm, numero_licencia: e.target.value})} placeholder="EMT-1234" /></div>
                        <div><label className="input-label text-blue-800">Vencimiento *</label><input type="date" required className="input-field border-blue-200" value={userForm.fecha_vencimiento_licencia} onChange={e => setUserForm({...userForm, fecha_vencimiento_licencia: e.target.value})} /></div>
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-900" checked={userForm.activo} onChange={e => setUserForm({...userForm, activo: e.target.checked})} /><span className="text-sm text-gray-700">Activo</span></label>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 btn-primary disabled:opacity-50">{editingId ? 'Guardar Cambios' : 'Crear Usuario'}</button>
                  </div>
                </form>
              )}

              {/* Boxes Form */}
              {activeTab === 'boxes' && (
                <form onSubmit={handleBoxSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Codigo *</label><input type="text" required className="input-field" value={boxForm.codigo} onChange={e => setBoxForm({...boxForm, codigo: e.target.value})} placeholder="CAJA-05" /></div>
                    <div><label className="input-label">Nombre *</label><input type="text" required className="input-field" value={boxForm.nombre} onChange={e => setBoxForm({...boxForm, nombre: e.target.value})} placeholder="Botiquin Narcoticos" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Unidad</label><select className="input-field" value={boxForm.unidad} onChange={e => setBoxForm({...boxForm, unidad: e.target.value})}><option value="">Seleccionar...</option>{unitsList.filter(un => un.activa).map(un => <option key={un.id} value={un.nombre}>{un.nombre}</option>)}</select></div>
                    <div><label className="input-label">Ubicacion</label><input type="text" className="input-field" value={boxForm.ubicacion} onChange={e => setBoxForm({...boxForm, ubicacion: e.target.value})} placeholder="Compartimiento" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Estado</label><select className="input-field" value={boxForm.estado} onChange={e => setBoxForm({...boxForm, estado: e.target.value})}><option value="ACTIVA">Activa</option><option value="EN_TRANSITO">En Transito</option><option value="CERRADA">Cerrada</option><option value="EXTRAVIADA">Extraviada</option></select></div>
                    <div><label className="input-label">Base</label><select className="input-field" value={boxForm.base} onChange={e => setBoxForm({...boxForm, base: e.target.value})}><option value="">Seleccionar...</option>{basesList.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 btn-primary disabled:opacity-50">{editingId ? 'Guardar Cambios' : 'Crear Caja'}</button>
                  </div>
                </form>
              )}

              {/* Meds Form */}
              {activeTab === 'meds' && (
                <form onSubmit={handleMedSubmit} className="space-y-4">
                  <button type="button" onClick={() => { setShowMedScanner(!showMedScanner); setNdcCheck({ status: '', mensaje: '' }); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-blue-300 rounded-xl text-sm font-medium text-blue-900 hover:border-blue-500 hover:bg-blue-50 transition-colors">
                    <ScanLine className="h-4 w-4" />
                    {showMedScanner ? 'Cerrar escaner' : 'Escanear empaque — llena NDC y datos del medicamento'}
                  </button>
                  {showMedScanner && (
                    <ScannerGS1 onScan={handleMedScan} onClose={() => setShowMedScanner(false)} titulo="Escanear DataMatrix del empaque" />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Nombre *</label><input type="text" required className="input-field" value={medForm.nombre} onChange={e => setMedForm({...medForm, nombre: e.target.value})} placeholder="Fentanyl" /></div>
                    <div><label className="input-label">Principio activo *</label><input type="text" required className="input-field" value={medForm.principio_activo} onChange={e => setMedForm({...medForm, principio_activo: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Concentracion *</label><input type="text" required className="input-field" value={medForm.concentracion} onChange={e => setMedForm({...medForm, concentracion: e.target.value})} placeholder="50 mcg/mL" /></div>
                    <div><label className="input-label">Presentacion *</label><input type="text" required className="input-field" value={medForm.presentacion} onChange={e => setMedForm({...medForm, presentacion: e.target.value})} placeholder="vial 2 mL" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="input-label">Tipo *</label><select className="input-field" value={medForm.tipo} onChange={e => { const t = e.target.value; setMedForm({...medForm, tipo: t, requiere_doble_factor: t === 'NARCOTICO' ? true : medForm.requiere_doble_factor}); }}><option value="GENERAL">General</option><option value="CONTROLADO">Controlado</option><option value="NARCOTICO">Narcotico</option></select></div>
                    <div><label className="input-label">Codigo barras</label><input type="text" className="input-field" value={medForm.codigo_barras} onChange={e => setMedForm({...medForm, codigo_barras: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">NDC {(medForm.tipo === 'NARCOTICO' || medForm.tipo === 'CONTROLADO') && <span className="text-red-600">*</span>}</label>
                      <div className="flex gap-2">
                        <input type="text" required={medForm.tipo === 'NARCOTICO' || medForm.tipo === 'CONTROLADO'} className="input-field flex-1" value={medForm.ndc} onChange={e => { setMedForm({...medForm, ndc: e.target.value}); setNdcCheck({ status: '', mensaje: '' }); }} placeholder="0409-1276-32" />
                        <button type="button" onClick={handleVerifyNdc} disabled={!medForm.ndc || ndcCheck.status === 'loading'} className="btn-secondary px-3 whitespace-nowrap disabled:opacity-40 flex items-center gap-1.5">
                          <ShieldCheck className="h-4 w-4" />
                          {ndcCheck.status === 'loading' ? 'Verificando...' : 'Verificar'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Como aparece en el empaque (4-4-2, 5-3-2 o 5-4-1)</p>
                    </div>
                    <div>
                      <label className="input-label">Schedule DEA</label>
                      <select className="input-field" value={medForm.dea_schedule} onChange={e => setMedForm({...medForm, dea_schedule: e.target.value})}>
                        <option value="">N/A</option>
                        <option value="II">Schedule II</option>
                        <option value="III">Schedule III</option>
                        <option value="IV">Schedule IV</option>
                        <option value="V">Schedule V</option>
                      </select>
                    </div>
                  </div>
                  {ndcCheck.mensaje && ndcCheck.status !== 'loading' && (
                    <div className={`p-3 rounded-xl border text-sm ${
                      ndcCheck.status === 'found' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      ndcCheck.status === 'notfound' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                      ndcCheck.status === 'offline' ? 'bg-gray-50 border-gray-200 text-gray-600' :
                      'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      {ndcCheck.mensaje}
                    </div>
                  )}
                  <div><label className="input-label">Temperatura</label><input type="text" className="input-field" value={medForm.temperatura_conservacion} onChange={e => setMedForm({...medForm, temperatura_conservacion: e.target.value})} placeholder="ambiente" /></div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-amber-600" checked={medForm.tipo === 'NARCOTICO' || medForm.requiere_doble_factor} disabled={medForm.tipo === 'NARCOTICO'} onChange={e => setMedForm({...medForm, requiere_doble_factor: e.target.checked})} />
                      <span className="text-sm text-amber-800">Requiere testigo / doble factor</span>
                    </label>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 btn-primary disabled:opacity-50">{editingId ? 'Guardar Cambios' : 'Crear Medicamento'}</button>
                  </div>
                </form>
              )}

              {/* Units Form */}
              {activeTab === 'units' && (
                <form onSubmit={handleUnitSubmit} className="space-y-4">
                  <div><label className="input-label">Nombre *</label><input type="text" required className="input-field" value={unitForm.nombre} onChange={e => setUnitForm({...unitForm, nombre: e.target.value})} placeholder="Ambulancia Delta-3" /></div>
                  <div><label className="input-label">Descripcion</label><textarea className="input-field" rows="3" value={unitForm.descripcion} onChange={e => setUnitForm({...unitForm, descripcion: e.target.value})} placeholder="Detalles..." /></div>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-900" checked={unitForm.activa} onChange={e => setUnitForm({...unitForm, activa: e.target.checked})} /><span className="text-sm text-gray-700">Activa</span></label>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 btn-primary disabled:opacity-50">{editingId ? 'Guardar Cambios' : 'Crear Unidad'}</button>
                  </div>
                </form>
              )}

              {/* Turnos Form */}
              {activeTab === 'turnos' && (
                <form onSubmit={handleTurnoSubmit} className="space-y-4">
                  <div>
                    <label className="input-label">Nombre del Turno *</label>
                    <input type="text" required className="input-field" value={turnoForm.nombre} onChange={e => setTurnoForm({...turnoForm, nombre: e.target.value})} placeholder="Ej: Turno Diurno" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">Hora Inicio *</label>
                      <input type="time" required className="input-field" value={turnoForm.hora_inicio} onChange={e => setTurnoForm({...turnoForm, hora_inicio: e.target.value})} />
                    </div>
                    <div>
                      <label className="input-label">Hora Fin *</label>
                      <input type="time" required className="input-field" value={turnoForm.hora_fin} onChange={e => setTurnoForm({...turnoForm, hora_fin: e.target.value})} />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 btn-primary disabled:opacity-50">Crear Turno</button>
                  </div>
                </form>
              )}

              {/* Bases Form */}
              {activeTab === 'bases' && (
                <form onSubmit={handleBaseSubmit} className="space-y-4">
                  <div>
                    <label className="input-label">Nombre de la Base *</label>
                    <input type="text" required className="input-field" value={baseForm.nombre} onChange={e => setBaseForm({...baseForm, nombre: e.target.value})} placeholder="Ej: Base Central" />
                  </div>
                  <div>
                    <label className="input-label">Direccion</label>
                    <input type="text" className="input-field" value={baseForm.direccion} onChange={e => setBaseForm({...baseForm, direccion: e.target.value})} placeholder="Direccion fisica" />
                  </div>
                  <div>
                    <label className="input-label">Descripcion</label>
                    <textarea className="input-field" rows="2" value={baseForm.descripcion} onChange={e => setBaseForm({...baseForm, descripcion: e.target.value})} placeholder="Detalles adicionales..." />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 btn-primary disabled:opacity-50">{editingId ? 'Guardar Cambios' : 'Crear Base'}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={deleteModal.open}
        title={deleteModal.type === 'box' ? 'Eliminar Caja' : deleteModal.type === 'turno' ? 'Eliminar Turno' : deleteModal.type === 'base' ? 'Eliminar Base' : 'Eliminar Unidad'}
        message="Esta accion no se puede deshacer. ¿Esta seguro?"
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => {
          if (deleteModal.type === 'box') handleDeleteBox(deleteModal.id);
          else if (deleteModal.type === 'turno') handleDeleteTurno(deleteModal.id);
          else if (deleteModal.type === 'base') handleDeleteBase(deleteModal.id);
          else handleDeleteUnit(deleteModal.id);
          setDeleteModal({ open: false, type: '', id: null });
        }}
        onCancel={() => setDeleteModal({ open: false, type: '', id: null })}
      />
    </div>
  );
};

export default AdminPanelPage;
