import React, { useState } from 'react';
import { api } from '../services/api';
import { Shield, AlertCircle, Package, Eye, EyeOff } from 'lucide-react';

const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [blockedInfo, setBlockedInfo] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // JWT login — returns { access, refresh, user }
      const loginRes = await api.post('/auth/login/', { username: username.trim(), password });
      const { access, refresh, user } = loginRes.data;

      onLogin(access, refresh, user);
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'ACCOUNT_LOCKED') {
        setBlockedInfo({ type: 'temporary', minutes: data?.minutes || 1, attempts_left: data?.attempts_left });
        setError(data?.detail || 'Cuenta bloqueada temporalmente por multiples intentos fallidos.');
      } else if (data?.code === 'ACCOUNT_PERMANENTLY_LOCKED') {
        setBlockedInfo({ type: 'permanent' });
        setError(data?.detail || 'Su cuenta ha sido bloqueada. Contacte al administrador para desbloquearla.');
      } else if (data?.detail) {
        setBlockedInfo(null);
        setError(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
      } else if (data?.code === 'LICENSE_INVALID') {
        setBlockedInfo(null);
        setError('Su licencia esta vencida o no tiene licencia asignada. Contacte al administrador.');
      } else {
        setBlockedInfo(null);
        setError('Credenciales invalidas o cuenta desactivada.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-elevated p-8">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-900 mb-5 shadow-card">
              <Package className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Sentinel</h1>
            <p className="text-gray-500 mt-1 text-sm">Sistema de Inventario de Medicamentos</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Shield className="h-3 w-3 text-blue-900" />
              <p className="text-[11px] text-gray-400 tracking-wide uppercase">
                Nivel Institucional · Auditoria Inmutable
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm mb-6 ${
              blockedInfo ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                {error}
                {blockedInfo?.type === 'temporary' && (
                  <p className="text-xs mt-1 opacity-75">Espere {blockedInfo.minutes} minuto(s) antes de intentar nuevamente.</p>
                )}
                {blockedInfo?.type === 'permanent' && (
                  <p className="text-xs mt-1 opacity-75">Solo un administrador puede desbloquear su cuenta.</p>
                )}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="input-label">Usuario</label>
              <input
                type="text"
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Ingrese su usuario"
              />
            </div>

            <div>
              <label className="input-label">Contrasena</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Ingrese su contrasena"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-sm disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Verificando...
                </span>
              ) : (
                'Iniciar Sesion'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-[11px] text-gray-400">
              Todos los accesos son registrados y auditados
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              IP y timestamp se registran automaticamente
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
