import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { FileText, Download, AlertTriangle, Clock, BarChart3, Shield, Filter, ChevronDown, ChevronUp } from 'lucide-react';

const ReportesPage = ({ user }) => {
  const [reportType, setReportType] = useState('dea');
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    caja: '', unidad: '', medicamento: '', lote: '', usuario: '',
    testigo: '', tipo: '', paciente: '', fecha_inicio: '', fecha_fin: '',
  });

  const [cajas, setCajas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [caducidades, setCaducidades] = useState([]);
  const [diasCaducidad, setDiasCaducidad] = useState(60);
  const [actividad, setActividad] = useState(null);
  const [auditLog, setAuditLog] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cajasRes, unidadesRes, medsRes, usersRes] = await Promise.all([
          api.get('/medicamentos/cajas/'), api.get('/unidades/'),
          api.get('/medicamentos/medicamentos/'), api.get('/auth/usuarios/'),
        ]);
        setCajas(cajasRes.data.results || cajasRes.data);
        setUnidades(unidadesRes.data.results || unidadesRes.data);
        setMedicamentos(medsRes.data.results || medsRes.data);
        setUsuarios(usersRes.data.results || usersRes.data);
      } catch (err) { console.error('Error cargando datos:', err); }
    };
    fetchData();
  }, []);

  const buildParams = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    return params.toString();
  };

  const downloadFile = async (url, filename, type = 'blob') => {
    setLoading(true);
    try {
      const response = await api.get(url, { responseType: type });
      const blob = new Blob([response.data]);
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(link.href);
    } catch (err) { console.error('Error descargando:', err); }
    finally { setLoading(false); }
  };

  const consultarActividad = async () => {
    setLoading(true);
    try { const res = await api.get(`/reportes/actividad/?${buildParams()}`); setActividad(res.data); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const consultarAuditLog = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.usuario) p.append('usuario', filters.usuario);
      if (filters.fecha_inicio) p.append('fecha_inicio', filters.fecha_inicio);
      if (filters.fecha_fin) p.append('fecha_fin', filters.fecha_fin);
      const res = await api.get(`/reportes/audit-log/?${p.toString()}`);
      setAuditLog(res.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const consultarCaducidades = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      p.append('dias', diasCaducidad);
      if (filters.caja) p.append('caja', filters.caja);
      if (filters.unidad) p.append('unidad', filters.unidad);
      const res = await api.get(`/reportes/caducidades/?${p.toString()}`);
      setCaducidades(res.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const activeFilters = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  const tabs = [
    { id: 'dea', label: 'DEA PDF', icon: FileText },
    { id: 'csv', label: 'CSV', icon: Download },
    { id: 'actividad', label: 'Actividad', icon: BarChart3 },
    { id: 'audit', label: 'Auditoria', icon: Shield },
    { id: 'caducidades', label: 'Caducidades', icon: Clock },
  ];

  const tiposTransaccion = ['ADMINISTRACION','REPOSICION','DESPERDICIO','TRANSFERENCIA','DEVOLUCION','AJUSTE','VENCIMIENTO'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes y Auditoria</h1>
        <p className="text-gray-500 mt-1">Generacion de reportes para cumplimiento DEA/EMS</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setReportType(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                reportType === tab.id
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          );
        })}
        {activeFilters > 0 && (
          <span className="badge bg-blue-100 text-blue-800 text-[10px]">{activeFilters} filtro{activeFilters > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Filter panel */}
      {['dea','csv','actividad'].includes(reportType) && (
        <div className="card">
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center justify-between w-full text-left">
            <span className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
              <Filter className="h-4 w-4 text-gray-400" />Filtros
            </span>
            {showFilters ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-5">
              <div><label className="input-label">Caja</label><select className="input-field" value={filters.caja} onChange={e => updateFilter('caja', e.target.value)}><option value="">Todas</option>{cajas.map(c => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></div>
              <div><label className="input-label">Unidad</label><select className="input-field" value={filters.unidad} onChange={e => updateFilter('unidad', e.target.value)}><option value="">Todas</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
              <div><label className="input-label">Medicamento</label><select className="input-field" value={filters.medicamento} onChange={e => updateFilter('medicamento', e.target.value)}><option value="">Todos</option>{medicamentos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
              <div><label className="input-label">Lote</label><input className="input-field" placeholder="Numero de lote" value={filters.lote} onChange={e => updateFilter('lote', e.target.value)} /></div>
              <div><label className="input-label">Usuario</label><select className="input-field" value={filters.usuario} onChange={e => updateFilter('usuario', e.target.value)}><option value="">Todos</option>{usuarios.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></div>
              <div><label className="input-label">Testigo</label><input className="input-field" placeholder="Nombre" value={filters.testigo} onChange={e => updateFilter('testigo', e.target.value)} /></div>
              <div><label className="input-label">Tipo</label><select className="input-field" value={filters.tipo} onChange={e => updateFilter('tipo', e.target.value)}><option value="">Todos</option>{tiposTransaccion.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="input-label">Paciente</label><input className="input-field" placeholder="ID" value={filters.paciente} onChange={e => updateFilter('paciente', e.target.value)} /></div>
              <div><label className="input-label">Fecha Inicio</label><input type="date" className="input-field" value={filters.fecha_inicio} onChange={e => updateFilter('fecha_inicio', e.target.value)} /></div>
              <div><label className="input-label">Fecha Fin</label><input type="date" className="input-field" value={filters.fecha_fin} onChange={e => updateFilter('fecha_fin', e.target.value)} /></div>
              <div className="flex items-end">
                <button onClick={() => setFilters({ caja:'', unidad:'', medicamento:'', lote:'', usuario:'', testigo:'', tipo:'', paciente:'', fecha_inicio:'', fecha_fin:'' })} className="text-sm text-blue-900 hover:text-blue-700">Limpiar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DEA */}
      {reportType === 'dea' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-900" />Reporte DEA - Control de Narcoticos</h3>
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <strong>21 CFR 1304:</strong> Incluye transacciones de narcoticos con inventario inicial/final, discrepancias y hash SHA-256.
          </div>
          <button onClick={() => downloadFile(`/reportes/dea/?${buildParams()}`, `reporte_dea_${new Date().toISOString().split('T')[0]}.pdf`)} disabled={loading} className="btn-primary disabled:opacity-50">
            <Download className="h-4 w-4" />{loading ? 'Generando...' : 'Descargar PDF'}
          </button>
        </div>
      )}

      {/* CSV */}
      {reportType === 'csv' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Download className="h-5 w-5 text-blue-900" />Exportar Transacciones (CSV)</h3>
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            Exporta transacciones con hash de verificacion. Compatible con Excel.
          </div>
          <button onClick={() => downloadFile(`/reportes/csv/?${buildParams()}`, `transacciones_${new Date().toISOString().split('T')[0]}.csv`)} disabled={loading} className="btn-primary disabled:opacity-50">
            <Download className="h-4 w-4" />{loading ? 'Exportando...' : 'Descargar CSV'}
          </button>
        </div>
      )}

      {/* Activity */}
      {reportType === 'actividad' && (
        <div className="space-y-4">
          <div className="card flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-900" />Dashboard de Actividad</h3>
            <button onClick={consultarActividad} disabled={loading} className="btn-primary text-sm disabled:opacity-50">{loading ? 'Cargando...' : 'Consultar'}</button>
          </div>
          {actividad && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card"><span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Transacciones</span><p className="text-2xl font-bold text-gray-900 mt-2">{actividad.total_transacciones}</p></div>
                <div className="stat-card"><span className="text-xs font-semibold uppercase tracking-wider text-amber-500">Alertas</span><p className="text-2xl font-bold text-amber-600 mt-2">{actividad.alertas_activas}</p></div>
                <div className="stat-card"><span className="text-xs font-semibold uppercase tracking-wider text-red-500">Incidentes</span><p className="text-2xl font-bold text-red-600 mt-2">{actividad.incidentes_abiertos}</p></div>
                <div className="stat-card"><span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Periodo</span><p className="text-sm font-medium text-gray-700 mt-2">{actividad.periodo ? `${actividad.periodo.inicio || '∞'} → ${actividad.periodo.fin || 'hoy'}` : 'Todo'}</p></div>
              </div>
              {actividad.por_tipo?.length > 0 && (
                <div className="card">
                  <h4 className="font-semibold text-gray-700 text-sm mb-4">Por Tipo</h4>
                  <div className="space-y-2.5">
                    {actividad.por_tipo.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{item.tipo}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-32 bg-gray-100 rounded-full h-1.5"><div className="bg-blue-900 h-1.5 rounded-full" style={{ width: `${Math.min(100, (item.total / actividad.total_transacciones) * 100)}%` }} /></div>
                          <span className="text-sm font-medium text-gray-900 w-8 text-right">{item.total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {actividad.por_usuario?.length > 0 && (
                <div className="card overflow-hidden p-0">
                  <h4 className="font-semibold text-gray-700 text-sm p-5 pb-0">Por Usuario</h4>
                  <table className="table-pro mt-3">
                    <thead><tr><th>Usuario</th><th className="text-right">Transacciones</th></tr></thead>
                    <tbody>{actividad.por_usuario.map((item, idx) => (
                      <tr key={idx}><td className="text-gray-700">{item.usuario__first_name} {item.usuario__last_name}</td><td className="text-right font-medium text-gray-900">{item.total}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {!actividad && !loading && <p className="text-center text-gray-400 py-12">Haz clic en "Consultar" para ver el dashboard</p>}
        </div>
      )}

      {/* Audit */}
      {reportType === 'audit' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Shield className="h-5 w-5 text-blue-900" />Log de Auditoria</h3>
              <button onClick={consultarAuditLog} disabled={loading} className="btn-primary text-sm disabled:opacity-50">{loading ? 'Cargando...' : 'Consultar'}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className="input-label">Usuario</label><select className="input-field" value={filters.usuario} onChange={e => updateFilter('usuario', e.target.value)}><option value="">Todos</option>{usuarios.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></div>
              <div><label className="input-label">Desde</label><input type="date" className="input-field" value={filters.fecha_inicio} onChange={e => updateFilter('fecha_inicio', e.target.value)} /></div>
              <div><label className="input-label">Hasta</label><input type="date" className="input-field" value={filters.fecha_fin} onChange={e => updateFilter('fecha_fin', e.target.value)} /></div>
            </div>
          </div>
          {auditLog.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <table className="table-pro">
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Entidad</th><th>Detalles</th></tr></thead>
                <tbody>
                  {auditLog.map((e, idx) => (
                    <tr key={idx}>
                      <td className="text-gray-500 whitespace-nowrap text-xs">{new Date(e.timestamp).toLocaleString('es-PR')}</td>
                      <td className="text-gray-700">{e.usuario_nombre || '—'}</td>
                      <td><span className={`badge text-[10px] ${e.accion?.includes('CREAR') ? 'bg-emerald-100 text-emerald-800' : e.accion?.includes('ELIMINAR') ? 'bg-red-100 text-red-800' : e.accion?.includes('EDITAR') ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{e.accion}</span></td>
                      <td className="text-gray-700">{e.entidad} {e.entidad_id ? `#${e.entidad_id}` : ''}</td>
                      <td className="text-gray-500 max-w-xs truncate text-xs">{e.detalles || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {auditLog.length === 0 && !loading && <p className="text-center text-gray-400 py-12">Haz clic en "Consultar" para ver el log</p>}
        </div>
      )}

      {/* Caducidades */}
      {reportType === 'caducidades' && (
        <div className="card space-y-5">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Reporte de Caducidades</h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div><label className="input-label">Dias para vencer</label><input type="number" value={diasCaducidad} onChange={e => setDiasCaducidad(e.target.value)} className="input-field w-28" /></div>
            <div><label className="input-label">Caja</label><select className="input-field" value={filters.caja} onChange={e => updateFilter('caja', e.target.value)}><option value="">Todas</option>{cajas.map(c => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></div>
            <div><label className="input-label">Unidad</label><select className="input-field" value={filters.unidad} onChange={e => updateFilter('unidad', e.target.value)}><option value="">Todas</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
            <button onClick={consultarCaducidades} disabled={loading} className="btn-primary text-sm disabled:opacity-50">{loading ? 'Consultando...' : 'Consultar'}</button>
          </div>
          {caducidades.length > 0 && (
            <div className="overflow-x-auto -mx-6"><div className="px-6">
              <table className="table-pro">
                <thead><tr><th>Medicamento</th><th>Tipo</th><th>Lote</th><th>Caja</th><th>Unidad</th><th className="text-right">Cant.</th><th>Vencimiento</th><th className="text-right">Dias</th></tr></thead>
                <tbody>
                  {caducidades.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-gray-900">{item.medicamento}</td>
                      <td><span className={`badge text-[10px] ${item.tipo === 'NARCOTICO' ? 'bg-red-100 text-red-800' : item.tipo === 'CONTROLADO' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{item.tipo || '—'}</span></td>
                      <td className="text-gray-600">{item.lote}</td>
                      <td className="text-gray-600">{item.caja}</td>
                      <td className="text-gray-600">{item.unidad || '—'}</td>
                      <td className="text-right text-gray-700">{item.cantidad}</td>
                      <td className="text-gray-600">{item.fecha_caducidad}</td>
                      <td className="text-right">
                        <span className={`badge text-[10px] ${item.dias_restantes <= 0 ? 'bg-red-600 text-white' : item.dias_restantes <= 30 ? 'bg-red-100 text-red-800' : item.dias_restantes <= 60 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {item.dias_restantes <= 0 ? 'VENCIDO' : item.dias_restantes}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
          )}
          {caducidades.length === 0 && !loading && <p className="text-center text-gray-400 py-8">Realiza una consulta para ver resultados</p>}
        </div>
      )}
    </div>
  );
};

export default ReportesPage;
