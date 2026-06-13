import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { Boxes, RefreshCw, Search, ChevronDown, ChevronUp, AlertTriangle, Clock, Package } from 'lucide-react';

const InventarioPage = ({ user }) => {
  const [inventario, setInventario] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCajas, setExpandedCajas] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [invRes, cajasRes] = await Promise.all([
        api.get('/medicamentos/inventario/'),
        api.get('/medicamentos/cajas/'),
      ]);
      const inv = invRes.data.results || invRes.data;
      const cj = cajasRes.data.results || cajasRes.data;
      setInventario(Array.isArray(inv) ? inv : []);
      setCajas(Array.isArray(cj) ? cj : []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error cargando inventario:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshing(true);
      fetchData().finally(() => setRefreshing(false));
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleCaja = (cajaId) => {
    setExpandedCajas(prev => ({ ...prev, [cajaId]: !prev[cajaId] }));
  };

  const agrupado = useMemo(() => {
    const filtered = search
      ? inventario.filter(i =>
          i.medicamento_nombre?.toLowerCase().includes(search.toLowerCase()) ||
          i.lote?.toLowerCase().includes(search.toLowerCase())
        )
      : inventario;

    const groups = {};
    cajas.forEach(c => { groups[c.id] = { ...c, items: [] }; });
    filtered.forEach(item => {
      if (groups[item.caja]) groups[item.caja].items.push(item);
    });
    return groups;
  }, [inventario, cajas, search]);

  const stats = useMemo(() => {
    let totalMedicamentos = 0;
    let totalUnidades = 0;
    let proximosAVencer = 0;
    let vencidos = 0;
    Object.values(agrupado).forEach(c => {
      c.items.forEach(item => {
        totalMedicamentos++;
        totalUnidades += item.cantidad || 0;
        if (item.proximo_a_vencer) proximosAVencer++;
        if (item.vencido) vencidos++;
      });
    });
    return { totalMedicamentos, totalUnidades, proximosAVencer, vencidos };
  }, [agrupado]);

  const formatTime = (date) => {
    if (!date) return '--:--';
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getExpiryColor = (item) => {
    if (item.vencido) return 'bg-red-50 border-red-200 text-red-700';
    if (item.proximo_a_vencer) return 'bg-amber-50 border-amber-200 text-amber-700';
    return '';
  };

  const getExpiryBadge = (item) => {
    if (item.vencido) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">VENCIDO</span>;
    if (item.proximo_a_vencer) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">VENCE PRONTO</span>;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center justify-center">
            <Boxes className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inventario en Tiempo Real</h1>
            <p className="text-sm text-gray-500">Medicamentos por caja — actualización automática cada 30s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            <span>{lastRefresh ? `Actualizado: ${formatTime(lastRefresh)}` : 'Cargando...'}</span>
            {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
          </div>
          <button
            onClick={() => { setRefreshing(true); fetchData().finally(() => setRefreshing(false)); }}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Actualizar ahora"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cajas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{cajas.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tipos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalMedicamentos}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unidades</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{stats.totalUnidades}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Alertas</p>
          <p className="text-2xl font-bold mt-1">
            <span className={stats.vencidos > 0 ? 'text-red-600' : stats.proximosAVencer > 0 ? 'text-amber-600' : 'text-emerald-600'}>
              {stats.vencidos + stats.proximosAVencer}
            </span>
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre de medicamento o lote..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-colors"
        />
      </div>

      {/* Cajas */}
      <div className="space-y-4">
        {Object.values(agrupado).map(caja => {
          const isExpanded = expandedCajas[caja.id] !== false;
          return (
            <div key={caja.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Caja header */}
              <button
                onClick={() => toggleCaja(caja.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                  <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${caja.codigo === 'ALMACEN' ? 'bg-amber-100' : 'bg-blue-900/10'}`}>
                    <Package className={`h-5 w-5 ${caja.codigo === 'ALMACEN' ? 'text-amber-700' : 'text-blue-900'}`} />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">{caja.codigo === 'ALMACEN' ? 'ALMACÉN' : caja.codigo}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        caja.estado === 'ACTIVA' ? 'bg-emerald-100 text-emerald-700' :
                        caja.estado === 'EN_TRANSITO' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {caja.estado}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{caja.codigo === 'ALMACEN' ? 'Stock central — compras pendientes de cargar' : `${caja.nombre} — ${caja.items.length} tipos de medicamento`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-blue-900">{caja.items.reduce((s, i) => s + (i.cantidad || 0), 0)}</p>
                    <p className="text-[10px] text-gray-400">unidades</p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                </div>
              </button>

              {/* Medicamentos */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {caja.items.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-400">
                      Sin medicamentos en esta caja
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {caja.items.map(item => (
                        <div key={item.id} className={`px-4 py-3 flex items-center justify-between ${getExpiryColor(item)}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                              item.vencido ? 'bg-red-500' : item.proximo_a_vencer ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">{item.medicamento_nombre}</p>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  item.medicamento_tipo === 'NARCOTICO' ? 'bg-red-100 text-red-700' :
                                  item.medicamento_tipo === 'CONTROLADO' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {item.medicamento_tipo}
                                </span>
                                {getExpiryBadge(item)}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                {item.lote && <span className="text-xs text-gray-500">Lote: {item.lote}</span>}
                                {item.fecha_caducidad && (
                                  <span className="text-xs text-gray-400">
                                    Vence: {new Date(item.fecha_caducidad + 'T00:00:00').toLocaleDateString('es-MX')}
                                    {item.dias_para_vencer != null && ` (${item.dias_para_vencer}d)`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className={`text-lg font-bold ${
                              item.vencido ? 'text-red-600' : item.proximo_a_vencer ? 'text-amber-600' : 'text-gray-900'
                            }`}>
                              {item.cantidad}
                            </p>
                            <p className="text-[10px] text-gray-400">uds</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {Object.values(agrupado).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Boxes className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No se encontraron resultados</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventarioPage;
