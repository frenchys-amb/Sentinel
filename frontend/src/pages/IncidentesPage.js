import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileSearch,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

const TIPO_LABELS = {
  DANO: 'Daño',
  PERDIDA: 'Pérdida',
  DISCREPANCIA: 'Discrepancia',
  DESCARTE_INCOMPLETO: 'Descarte incompleto',
  DESVIO: 'Posible desvío',
  VENCIMIENTO: 'Vencido no retirado',
  VENCIDO_ALMACEN: 'Vencido en Almacén',
  OTRO: 'Otro',
};

const ESTADO_COLORS = {
  ABIERTO: 'bg-red-100 text-red-800',
  EN_INVESTIGACION: 'bg-amber-100 text-amber-800',
  PENDIENTE_APROBACION: 'bg-purple-100 text-purple-800',
  CERRADO: 'bg-emerald-100 text-emerald-800',
};

const SEVERIDAD_COLORS = {
  CRITICA: 'bg-red-600 text-white',
  ALTA: 'bg-orange-500 text-white',
  MEDIA: 'bg-amber-400 text-gray-900',
  BAJA: 'bg-blue-200 text-blue-900',
};

const IncidentesPage = ({ user }) => {
  const [incidentes, setIncidentes] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [approveModal, setApproveModal] = useState({ open: false, id: null });
  const [reopenModal, setReopenModal] = useState({ open: false, id: null });

  const [createForm, setCreateForm] = useState({
    tipo: 'DISCREPANCIA',
    severidad: 'MEDIA',
    titulo: '',
    descripcion: '',
    caja_relacionada: '',
    medicamento_relacionado: '',
    cantidad_afectada: 0,
    lote_afectado: '',
  });

  const [investigateForm, setInvestigateForm] = useState({
    causa_raiz: '',
    acciones_correctivas: '',
    resolucion: '',
  });

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEstado]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = filterEstado ? `?estado=${filterEstado}` : '';
      const [incRes, cajasRes, medsRes, usersRes] = await Promise.all([
        api.get(`/alertas/incidentes/${params}`),
        api.get('/medicamentos/cajas/'),
        api.get('/medicamentos/medicamentos/'),
        api.get('/auth/usuarios/'),
      ]);
      setIncidentes(incRes.data.results || incRes.data);
      setCajas(cajasRes.data.results || cajasRes.data);
      setMedicamentos(medsRes.data.results || medsRes.data);
      setUsuarios(usersRes.data.results || usersRes.data);
    } catch (err) {
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...createForm,
        caja_relacionada: createForm.caja_relacionada ? parseInt(createForm.caja_relacionada) : null,
        medicamento_relacionado: createForm.medicamento_relacionado
          ? parseInt(createForm.medicamento_relacionado)
          : null,
        cantidad_afectada: parseInt(createForm.cantidad_afectada) || 0,
      };
      await api.post('/alertas/incidentes/', payload);
      setSuccess('Incidente creado exitosamente');
      setShowCreateModal(false);
      setCreateForm({
        tipo: 'DISCREPANCIA', severidad: 'MEDIA', titulo: '', descripcion: '',
        caja_relacionada: '', medicamento_relacionado: '', cantidad_afectada: 0, lote_afectado: '',
      });
      fetchAll();
    } catch (err) {
      setError(
        err.response?.data
          ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ')
          : 'Error al crear incidente'
      );
    }
  };

  const handleAsignar = async (incidenteId, investigadorId) => {
    setError('');
    setSuccess('');
    try {
      await api.post(`/alertas/incidentes/${incidenteId}/asignar/`, {
        investigador: investigadorId,
      });
      setSuccess('Investigador asignado');
      fetchAll();
    } catch (err) {
      setError('Error al asignar investigador');
    }
  };

  const handleInvestigar = async (incidenteId) => {
    setError('');
    setSuccess('');
    try {
      await api.post(`/alertas/incidentes/${incidenteId}/investigar/`, investigateForm);
      setSuccess('Investigación registrada, pendiente de aprobación');
      setInvestigateForm({ causa_raiz: '', acciones_correctivas: '', resolucion: '' });
      fetchAll();
    } catch (err) {
      setError(
        err.response?.data
          ? Object.entries(err.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ')
          : 'Error al registrar investigación'
      );
    }
  };

  const handleAprobar = async (incidenteId, notas) => {
    setError('');
    setSuccess('');
    try {
      await api.post(`/alertas/incidentes/${incidenteId}/aprobar/`, {
        notas_aprobacion: notas || '',
      });
      setSuccess('Incidente aprobado y cerrado');
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al aprobar incidente');
    }
  };

  const handleReabrir = async (incidenteId, motivo) => {
    setError('');
    setSuccess('');
    try {
      await api.post(`/alertas/incidentes/${incidenteId}/reabrir/`, { motivo });
      setSuccess('Incidente reabierto');
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al reabrir');
    }
  };

  const stats = {
    abiertos: incidentes.filter((i) => i.estado === 'ABIERTO').length,
    investigacion: incidentes.filter((i) => i.estado === 'EN_INVESTIGACION').length,
    pendientes: incidentes.filter((i) => i.estado === 'PENDIENTE_APROBACION').length,
    cerrados: incidentes.filter((i) => i.estado === 'CERRADO').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidentes</h1>
          <p className="text-gray-500">Investigación, evidencia, resolución y aprobación</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Nuevo Incidente
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setFilterEstado('ABIERTO')} className={`stat-card text-left hover:shadow-card-hover transition-all ${filterEstado === 'ABIERTO' ? 'ring-2 ring-red-300' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-500">Abiertos</p>
          <p className="text-2xl font-bold text-red-600 mt-2">{stats.abiertos}</p>
        </button>
        <button onClick={() => setFilterEstado('EN_INVESTIGACION')} className={`stat-card text-left hover:shadow-card-hover transition-all ${filterEstado === 'EN_INVESTIGACION' ? 'ring-2 ring-amber-300' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">En investigación</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{stats.investigacion}</p>
        </button>
        <button onClick={() => setFilterEstado('PENDIENTE_APROBACION')} className={`stat-card text-left hover:shadow-card-hover transition-all ${filterEstado === 'PENDIENTE_APROBACION' ? 'ring-2 ring-purple-300' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">Pendientes</p>
          <p className="text-2xl font-bold text-purple-600 mt-2">{stats.pendientes}</p>
        </button>
        <button onClick={() => setFilterEstado('')} className={`stat-card text-left hover:shadow-card-hover transition-all ${filterEstado === '' ? 'ring-2 ring-emerald-300' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">Todos / Cerrados</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{stats.cerrados}</p>
        </button>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="modal-content w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-900" />
                Reportar Nuevo Incidente
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="input-label">Tipo *</label>
                  <select
                    className="input-field"
                    value={createForm.tipo}
                    onChange={(e) => setCreateForm({ ...createForm, tipo: e.target.value })}
                  >
                    {Object.entries(TIPO_LABELS)
                      .filter(([k]) => k !== 'VENCIDO_ALMACEN' || user?.rol === 'ADMIN')
                      .map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">Severidad *</label>
                  <select
                    className="input-field"
                    value={createForm.severidad}
                    onChange={(e) => setCreateForm({ ...createForm, severidad: e.target.value })}
                  >
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Media</option>
                    <option value="ALTA">Alta</option>
                    <option value="CRITICA">Crítica</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Cantidad afectada</label>
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    value={createForm.cantidad_afectada}
                    onChange={(e) => setCreateForm({ ...createForm, cantidad_afectada: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="input-label">Título *</label>
                <input
                  type="text"
                  required
                  className="input-field"
                  value={createForm.titulo}
                  onChange={(e) => setCreateForm({ ...createForm, titulo: e.target.value })}
                  placeholder="Descripción breve del incidente"
                />
              </div>

              <div>
                <label className="input-label">Descripción detallada *</label>
                <textarea
                  required
                  className="input-field"
                  rows="3"
                  value={createForm.descripcion}
                  onChange={(e) => setCreateForm({ ...createForm, descripcion: e.target.value })}
                  placeholder="Qué sucedió, cuándo, dónde, quiénes estuvieron involucrados..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="input-label">Caja relacionada</label>
                  <select
                    className="input-field"
                    value={createForm.caja_relacionada}
                    onChange={(e) => setCreateForm({ ...createForm, caja_relacionada: e.target.value })}
                  >
                    <option value="">Ninguna</option>
                    {cajas.map((c) => (
                      <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">Medicamento</label>
                  <select
                    className="input-field"
                    value={createForm.medicamento_relacionado}
                    onChange={(e) => setCreateForm({ ...createForm, medicamento_relacionado: e.target.value })}
                  >
                    <option value="">Ninguno</option>
                    {medicamentos.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre} ({m.tipo})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">Lote afectado</label>
                  <input
                    type="text"
                    className="input-field"
                    value={createForm.lote_afectado}
                    onChange={(e) => setCreateForm({ ...createForm, lote_afectado: e.target.value })}
                    placeholder="Número de lote"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 btn-primary flex items-center justify-center gap-2">
                  <Plus className="h-4 w-4" />
                  Crear Incidente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Incidents list — only visible for ADMIN/AUDITOR */}
      {user?.rol === 'PARAMEDICO' ? (
        <div className="text-center py-12">
          <ShieldCheck className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
          <p className="text-gray-500">Use el boton "Nuevo Incidente" para reportar un incidente.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-900"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {incidentes.map((inc) => {
            const isExpanded = expandedId === inc.id;
            return (
              <div
                key={inc.id}
                className={`card border-l-4 ${
                  inc.severidad === 'CRITICA' ? 'border-l-red-500' :
                  inc.severidad === 'ALTA' ? 'border-l-orange-500' :
                  inc.severidad === 'MEDIA' ? 'border-l-amber-500' :
                  'border-l-blue-500'
                }`}
              >
                {/* Header */}
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : inc.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${ESTADO_COLORS[inc.estado]}`}>
                        {inc.estado.replace('_', ' ')}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${SEVERIDAD_COLORS[inc.severidad]}`}>
                        {inc.severidad}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700">
                        {TIPO_LABELS[inc.tipo] || inc.tipo}
                      </span>
                      <span className="text-xs text-gray-400">#{inc.id}</span>
                    </div>
                    <h4 className="font-semibold text-gray-900 mt-1">{inc.titulo}</h4>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{inc.descripcion}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      <span>Reportado: {inc.reportado_por_nombre}</span>
                      {inc.investigador_nombre && <span>Investigador: {inc.investigador_nombre}</span>}
                      {inc.caja_codigo && <span>Caja: {inc.caja_codigo}</span>}
                      <span>{new Date(inc.fecha_creacion).toLocaleString('es-MX')}</span>
                    </div>
                  </div>
                  <div className="ml-4 mt-1">
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                    {/* Full description */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Descripción</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{inc.descripcion}</p>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {inc.medicamento_nombre && (
                        <div>
                          <p className="text-xs text-gray-500 font-semibold">Medicamento</p>
                          <p className="font-medium text-gray-900">{inc.medicamento_nombre}</p>
                        </div>
                      )}
                      {inc.lote_afectado && (
                        <div>
                          <p className="text-xs text-gray-500 font-semibold">Lote</p>
                          <p className="font-medium text-gray-900">{inc.lote_afectado}</p>
                        </div>
                      )}
                      {inc.cantidad_afectada > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-semibold">Cantidad</p>
                          <p className="font-medium text-gray-900">{inc.cantidad_afectada}</p>
                        </div>
                      )}
                      {inc.aprobado_por_nombre && (
                        <div>
                          <p className="text-xs text-gray-500 font-semibold">Aprobado por</p>
                          <p className="font-medium text-gray-900">{inc.aprobado_por_nombre}</p>
                        </div>
                      )}
                    </div>

                    {/* Investigation results */}
                    {inc.causa_raiz && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-semibold text-blue-800 uppercase flex items-center gap-1">
                          <FileSearch className="h-3.5 w-3.5" /> Resultado de investigación
                        </p>
                        <div>
                          <p className="text-xs text-blue-700 font-semibold">Causa raíz:</p>
                          <p className="text-sm text-blue-900">{inc.causa_raiz}</p>
                        </div>
                        {inc.acciones_correctivas && (
                          <div>
                            <p className="text-xs text-blue-700 font-semibold">Acciones correctivas:</p>
                            <p className="text-sm text-blue-900">{inc.acciones_correctivas}</p>
                          </div>
                        )}
                        {inc.resolucion && (
                          <div>
                            <p className="text-xs text-blue-700 font-semibold">Resolución:</p>
                            <p className="text-sm text-blue-900 whitespace-pre-wrap">{inc.resolucion}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons based on state */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {/* Assign investigator (ADMIN/AUDITOR, when ABIERTO) */}
                      {inc.estado === 'ABIERTO' && user.rol !== 'PARAMEDICO' && (
                        <div className="flex items-center gap-2">
                          <select
                            className="input-field text-sm py-1.5"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) handleAsignar(inc.id, parseInt(e.target.value));
                            }}
                          >
                            <option value="">Asignar investigador...</option>
                            {usuarios.filter((u) => u.activo).map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.first_name} {u.last_name} ({u.rol})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Investigate (assigned investigator or admin, when EN_INVESTIGACION) */}
                      {inc.estado === 'EN_INVESTIGACION' &&
                        (user.id === inc.investigador || user.rol === 'ADMIN') && (
                        <div className="w-full space-y-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <p className="text-xs font-semibold text-gray-600 uppercase flex items-center gap-1">
                            <Search className="h-3.5 w-3.5" /> Registrar hallazgos
                          </p>
                          <div>
                            <label className="input-label">Causa raíz *</label>
                            <textarea
                              className="input-field"
                              rows="2"
                              value={investigateForm.causa_raiz}
                              onChange={(e) =>
                                setInvestigateForm({ ...investigateForm, causa_raiz: e.target.value })
                              }
                              placeholder="¿Qué causó el incidente?"
                            />
                          </div>
                          <div>
                            <label className="input-label">Acciones correctivas</label>
                            <textarea
                              className="input-field"
                              rows="2"
                              value={investigateForm.acciones_correctivas}
                              onChange={(e) =>
                                setInvestigateForm({
                                  ...investigateForm,
                                  acciones_correctivas: e.target.value,
                                })
                              }
                              placeholder="¿Qué se hizo o se hará para corregir?"
                            />
                          </div>
                          <div>
                            <label className="input-label">Resolución</label>
                            <textarea
                              className="input-field"
                              rows="2"
                              value={investigateForm.resolucion}
                              onChange={(e) =>
                                setInvestigateForm({ ...investigateForm, resolucion: e.target.value })
                              }
                              placeholder="Conclusión y resolución propuesta"
                            />
                          </div>
                          <button
                            onClick={() => handleInvestigar(inc.id)}
                            className="btn-primary text-sm flex items-center gap-2"
                          >
                            <FileSearch className="h-4 w-4" />
                            Enviar a aprobación
                          </button>
                        </div>
                      )}

                      {/* Approve (ADMIN/AUDITOR, when PENDIENTE_APROBACION) */}
                      {inc.estado === 'PENDIENTE_APROBACION' && user.rol !== 'PARAMEDICO' && (
                        <button
                          onClick={() => setApproveModal({ open: true, id: inc.id })}
                          className="btn-success text-sm flex items-center gap-1"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Aprobar y cerrar
                        </button>
                      )}

                      {/* Reopen (ADMIN/AUDITOR, when CERRADO) */}
                      {inc.estado === 'CERRADO' && user.rol !== 'PARAMEDICO' && (
                        <button
                          onClick={() => setReopenModal({ open: true, id: inc.id })}
                          className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reabrir
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {incidentes.length === 0 && (
            <div className="text-center py-12">
              <ShieldCheck className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay incidentes en esta categoría</p>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={approveModal.open}
        title="Aprobar Incidente"
        message="El incidente será marcado como cerrado."
        confirmLabel="Aprobar y cerrar"
        variant="info"
        withInput={true}
        inputLabel="Notas de aprobación (opcional)"
        inputPlaceholder="Observaciones adicionales..."
        onConfirm={(notas) => {
          handleAprobar(approveModal.id, notas);
          setApproveModal({ open: false, id: null });
        }}
        onCancel={() => setApproveModal({ open: false, id: null })}
      />

      <ConfirmModal
        isOpen={reopenModal.open}
        title="Reabrir Incidente"
        message="El incidente volverá al estado de investigación."
        confirmLabel="Reabrir"
        variant="warning"
        withInput={true}
        inputLabel="Motivo de reapertura"
        inputPlaceholder="¿Por qué se reabre este incidente?"
        inputRequired={true}
        onConfirm={(motivo) => {
          handleReabrir(reopenModal.id, motivo);
          setReopenModal({ open: false, id: null });
        }}
        onCancel={() => setReopenModal({ open: false, id: null })}
      />
    </div>
  );
};

export default IncidentesPage;
