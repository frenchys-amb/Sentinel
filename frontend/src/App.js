import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, setTokens } from './services/api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransaccionesPage from './pages/TransaccionesPage';
import TurnoPage from './pages/TurnoPage';
import AlertasPage from './pages/AlertasPage';
import ReportesPage from './pages/ReportesPage';
import AdminPanelPage from './pages/AdminPanelPage';
import CustodiaPage from './pages/CustodiaPage';
import IncidentesPage from './pages/IncidentesPage';
import ProtocolosPage from './pages/ProtocolosPage';
import InventarioPage from './pages/InventarioPage';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import InactivityTimeout from './components/InactivityTimeout';
import BotonEmergencia from './components/BotonEmergencia';
import { ToastProvider } from './components/Toast';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      api.get('/auth/usuarios/me/')
        .then(res => setUser(res.data))
        .catch(() => {
          setTokens(null, null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (accessToken, refreshToken, userData) => {
    setTokens(accessToken, refreshToken);
    setUser(userData);
  };

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await api.post('/auth/logout/', { refresh: refreshToken });
      } catch (e) {
        // Blacklist may fail if token already expired — that's fine
      }
    }
    setTokens(null, null);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-900" />
      </div>
    );
  }

  if (!user) {
    return (
      <ToastProvider>
        <LoginPage onLogin={handleLogin} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="min-h-screen bg-white">
          {user.rol === 'PARAMEDICO' && <InactivityTimeout onLogout={handleLogout} />}
          <Navbar user={user} onLogout={handleLogout} />
          <BotonEmergencia user={user} />
          <main className="container mx-auto px-4 py-8 max-w-7xl">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={user.rol === 'PARAMEDICO' ? <Navigate to="/custodia" /> : <DashboardPage user={user} />} />
                {/* Turno removed - managed by admin */}
                <Route path="/transacciones" element={<TransaccionesPage user={user} />} />
                <Route path="/custodia" element={<CustodiaPage user={user} />} />
                <Route path="/alertas" element={<AlertasPage user={user} />} />
                <Route path="/incidentes" element={<IncidentesPage user={user} />} />
                <Route path="/reportes" element={<ReportesPage user={user} />} />
                <Route path="/protocolos" element={<ProtocolosPage user={user} />} />
                <Route path="/inventario" element={<InventarioPage user={user} />} />
                <Route path="/admin-panel" element={user.rol === 'ADMIN' ? <AdminPanelPage user={user} /> : <Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;
