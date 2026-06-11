import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { AlertTriangle, CheckCircle, Clock, Package, Activity, ShieldAlert, Pill, ArrowUpDown } from 'lucide-react';

const DashboardSemaforo = () => {
  const [cajas, setCajas] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [semaforoRes, statsRes] = await Promise.all([
        api.get('/alertas/dashboard/semaforo/'),
        api.get('/alertas/dashboard/estadisticas/'),
      ]);
      setCajas(semaforoRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const getColorConfig = (color) => {
    switch (color) {
      case 'VERDE':    return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: 'text-emerald-600' };
      case 'AMARILLO': return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', icon: 'text-amber-600' };
      case 'ROJO':     return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500', icon: 'text-red-600' };
      default:         return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', dot: 'bg-gray-400', icon: 'text-gray-500' };
    }
  };

  const getIcon = (color) => {
    switch (color) {
      case 'VERDE':    return <CheckCircle className="h-5 w-5" />;
      case 'AMARILLO': return <Clock className="h-5 w-5" />;
      case 'ROJO':     return <AlertTriangle className="h-5 w-5" />;
      default:         return <Package className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Medicamentos</span>
              <Pill className="h-4 w-4 text-blue-900" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total_medicamentos}</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Cajas Activas</span>
              <Package className="h-4 w-4 text-blue-700" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total_cajas - stats.cajas_extraviadas}</p>
            {stats.cajas_extraviadas > 0 && (
              <p className="text-xs text-red-600 mt-1">{stats.cajas_extraviadas} extraviadas</p>
            )}
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Alertas Activas</span>
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
            <p className={`text-2xl font-bold mt-2 ${stats.alertas_criticas > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {stats.alertas_activas}
            </p>
            {stats.alertas_criticas > 0 && (
              <p className="text-xs text-red-600 mt-1">{stats.alertas_criticas} criticas</p>
            )}
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Trans. Hoy</span>
              <ArrowUpDown className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stats.transacciones_hoy}</p>
          </div>
        </div>
      )}

      {/* Semaforo grid */}
      <div>
        <div className="flex items-center gap-2 mb-5">
          <Activity className="h-5 w-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Estado de Cajas</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cajas.map((caja) => {
            const colors = getColorConfig(caja.color);
            return (
              <div
                key={caja.caja_id}
                className={`rounded-2xl border p-5 transition-all hover:shadow-card-hover ${colors.bg} ${colors.border}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      <span className="font-semibold text-gray-900 text-sm">{caja.caja_codigo}</span>
                    </div>
                    <p className="text-sm text-gray-600">{caja.caja_nombre}</p>
                    <p className="text-xs mt-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        caja.estado_caja === 'ACTIVA' ? 'bg-emerald-100 text-emerald-800' :
                        caja.estado_caja === 'EXTRAVIADA' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {caja.estado_caja}
                      </span>
                    </p>
                  </div>
                  <div className={`p-2 rounded-xl ${colors.bg} ${colors.icon}`}>
                    {getIcon(caja.color)}
                  </div>
                </div>

                {caja.color !== 'VERDE' && (
                  <div className="mt-3 pt-3 border-t border-gray-200/60 space-y-1">
                    {caja.discrepancia && (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Discrepancia detectada
                      </p>
                    )}
                    {caja.vencimientos_30_60 > 0 && (
                      <p className="text-xs text-amber-600">
                        {caja.vencimientos_30_60} proximos a vencer
                      </p>
                    )}
                    {caja.vencidos > 0 && (
                      <p className="text-xs text-red-600 font-medium">
                        {caja.vencidos} vencidos
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {cajas.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay cajas registradas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardSemaforo;
