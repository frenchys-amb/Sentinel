import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, AlertTriangle, FileText, LogOut,
  Wifi, WifiOff, ShieldCheck, ClipboardCheck, Link2, FileSearch, BookOpen, Boxes
} from 'lucide-react';
import { useOffline } from '../hooks/useOffline';

const Navbar = ({ user, onLogout }) => {
  const location = useLocation();
  const { isOnline, pendingSync } = useOffline();

  const allNavItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'AUDITOR'] },
    { path: '/custodia', label: 'Custodia', icon: Link2, roles: ['ADMIN', 'PARAMEDICO', 'AUDITOR'] },
    { path: '/incidentes', label: 'Incidentes', icon: FileSearch, roles: ['ADMIN', 'PARAMEDICO', 'AUDITOR'] },
    { path: '/transacciones', label: 'Transacciones', icon: Package, roles: ['ADMIN', 'PARAMEDICO', 'AUDITOR'] },
    { path: '/inventario', label: 'Inventario', icon: Boxes, roles: ['ADMIN', 'AUDITOR'] },
    { path: '/alertas', label: 'Alertas', icon: AlertTriangle, roles: ['ADMIN', 'AUDITOR'] },
    { path: '/reportes', label: 'Reportes', icon: FileText, roles: ['ADMIN', 'AUDITOR'] },
    { path: '/protocolos', label: 'Protocolos', icon: BookOpen, roles: ['ADMIN', 'PARAMEDICO', 'AUDITOR'] },
  ];

  const navItems = allNavItems.filter(item => item.roles.includes(user?.rol));

  return (
    <nav className="bg-blue-900 text-white shadow-lg sticky top-0 z-40">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <Package className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight hidden sm:block">Sentinel</span>
            {!isOnline && (
              <span className="ml-1 px-2 py-0.5 bg-amber-500 text-[10px] font-bold rounded-full flex items-center gap-1">
                <WifiOff className="h-3 w-3" />OFFLINE{pendingSync > 0 && ` (${pendingSync})`}
              </span>
            )}
            {isOnline && pendingSync > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-amber-500 text-[10px] font-bold rounded-full flex items-center gap-1">
                <Wifi className="h-3 w-3" />{pendingSync} pend.
              </span>
            )}
          </div>

          {/* Nav items */}
          <div className="flex items-center gap-0.5 overflow-x-auto px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-blue-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right */}
          <div className="flex items-center gap-3 shrink-0">
            {user && user.rol === 'ADMIN' && (
              <Link
                to="/admin-panel"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-bold transition-all ${
                  location.pathname === '/admin-panel'
                    ? 'bg-amber-400 text-blue-900'
                    : 'bg-white/10 text-amber-400 hover:bg-amber-400 hover:text-blue-900'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
            <div className="hidden md:block text-right pl-3 border-l border-white/20">
              <p className="text-sm font-medium leading-tight">{user.first_name} {user.last_name}</p>
              <p className="text-[11px] text-blue-300 leading-tight">{user.rol} · Lic: {user.numero_licencia || 'N/A'}</p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg text-blue-300 hover:text-white hover:bg-white/10 transition-colors" title="Cerrar sesion">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
