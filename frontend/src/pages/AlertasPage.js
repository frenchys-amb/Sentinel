import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import {
  AlertTriangle, CheckCircle, Clock, Shield,
  AlertOctagon, Package, UserX, TrendingUp
} from 'lucide-react';

const AlertasPage = ({ user }) => {
  const [alertas, setAlertas] = useState([]);
  const [filter, setFilter] = useState('TODAS');
  const [resolveModal, setResolveModal] = useState({ open: false, alertaId: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlertas = async () => {
    try {
      const res = await api.get('/alertas/');
      setAlertas(res.data.results || res.data);
    } catch (err) {
      console.error('Error cargando alertas:', err);
    } finally { setLoading(false); }
  };

  const resolverAlerta = async (id, notas = '') => {
    try {
      await api.post(`/alertas/${id}/resolver/`, { notas });
      fetchAlertas();
    } catch (err) { console.error('Error al resolver alerta:', err); }
  };

  const getSeveridadBadge = (s) => {
    switch (s) {
      case 'CRITICA': return 'bg-red-100 text-red-800';
      case 'ALTA':    return 'bg-orange-100 text-orange-800';
      case 'MEDIA':   return 'bg-amber-100 text-amber-800';
      case 'BAJA':    return 'bg-blue-100 text-blue-800';
      default:        return 'bg-gray-100 text-gray-700';
    }
  };

  const getSeveridadBorder = (s) => {
    switch (s) {
      case 'CRITICA': return 'border-l-red-500';
      case 'ALTA':    return 'border-l-orange-500';
      case 'MEDIA':   return 'border-l-amber-500';
      case 'BAJA':    return 'border-l-blue-500';
      default:        return 'border-l-gray-300';
    }
  };

  const getTipoIcon = (tipo) => {
    switch (tipo) {
      case 'DESVIO':          return <TrendingUp className="h-4 w-4" />;
      case 'VENCIMIENTO':     return <Clock className="h-4 w-4" />;
      case 'VENCIDO':         return <AlertOctagon className="h-4 w-4" />;
      case 'CAJA_EXTRAVIADA': return <Package className="h-4 w-4" />;
      case 'LICENCIA':        return <UserX className="h-4 w-4" />;
      case 'DISCREPANCIA':    return <Shield className="h-4 w-4" />;
      default:                return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const filteredAlertas = filter === 'TODAS' ? alertas :
    filter === 'ACTIVAS' ? alertas.filter(a => !a.resuelta) :
    alertas.filter(a => a.resuelta);

  const stats = {
    total: alertas.length,
    activas: alertas.filter(a => !a.resuelta).length,
    criticas: alertas.filter(a => !a.resuelta && a.severidad === 'CRITICA').length,
    resueltas: alertas.filter(a => a.resuelta).length,
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-900" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Alertas del Sistema</h1>
        <p className="text-gray-500 mt-1">Deteccion automatica de anomalias y riesgos</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total</span>
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
        </div>
        <div className="stat-card">
          <span className="text-xs font-semibold uppercase tracking-wider text-red-500">Criticas</span>
          <p className="text-2xl font-bold text-red-600 mt-2">{stats.criticas}</p>
        </div>
        <div className="stat-card">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-500">Pendientes</span>
          <p className="text-2xl font-bold text-amber-600 mt-2">{stats.activas}</p>
        </div>
        <div className="stat-card">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-500">Resueltas</span>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{stats.resueltas}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['TODAS', 'ACTIVAS', 'RESUELTAS'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f
                ? 'bg-blue-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'TODAS' ? 'Todas' : f === 'ACTIVAS' ? 'Activas' : 'Resueltas'}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {filteredAlertas.map((alerta) => (
          <div
            key={alerta.id}
            className={`card border-l-4 ${getSeveridadBorder(alerta.severidad)}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`p-2 rounded-xl ${
                  alerta.severidad === 'CRITICA' ? 'bg-red-50 text-red-600' :
                  alerta.severidad === 'ALTA' ? 'bg-orange-50 text-orange-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {getTipoIcon(alerta.tipo)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-gray-900 text-sm">{alerta.titulo}</h4>
                    <span className={`badge ${getSeveridadBadge(alerta.severidad)} text-[10px]`}>{alerta.severidad}</span>
                    {alerta.resuelta && <span className="badge bg-emerald-100 text-emerald-800 text-[10px]">RESUELTA</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{alerta.descripcion}</p>
                  <p className="text-xs text-gray-400 mt-2">{new Date(alerta.timestamp).toLocaleString('es-PR')}</p>
                </div>
              </div>

              {!alerta.resuelta && user.rol !== 'PARAMEDICO' && (
                <button
                  onClick={() => setResolveModal({ open: true, alertaId: alerta.id })}
                  className="btn-success text-xs py-1.5 px-3 shrink-0"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Resolver
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredAlertas.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay alertas en esta categoria</p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={resolveModal.open}
        title="Resolver Alerta"
        message="Ingrese notas sobre la resolución de esta alerta."
        confirmLabel="Resolver"
        variant="info"
        withInput={true}
        inputLabel="Notas de resolución"
        inputPlaceholder="Describa cómo se resolvió..."
        onConfirm={(notas) => {
          resolverAlerta(resolveModal.alertaId, notas || '');
          setResolveModal({ open: false, alertaId: null });
        }}
        onCancel={() => setResolveModal({ open: false, alertaId: null })}
      />
    </div>
  );
};

export default AlertasPage;
