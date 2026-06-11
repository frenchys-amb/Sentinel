-- Políticas de Row Level Security para Supabase PostgreSQL
-- Ejecutar en la consola SQL de Supabase después de crear las tablas

-- Habilitar RLS en tablas críticas
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Política: Solo INSERT permitido en transacciones (inmutabilidad)
CREATE POLICY "insert_transacciones" ON transacciones
    FOR INSERT WITH CHECK (true);

-- Política: SELECT permitido para usuarios autenticados
CREATE POLICY "select_transacciones" ON transacciones
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política: UPDATE denegado explícitamente
CREATE POLICY "deny_update_transacciones" ON transacciones
    FOR UPDATE USING (false);

-- Política: DELETE denegado explícitamente
CREATE POLICY "deny_delete_transacciones" ON transacciones
    FOR DELETE USING (false);

-- Política: Solo INSERT en system_logs
CREATE POLICY "insert_system_logs" ON system_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "select_system_logs" ON system_logs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "deny_update_system_logs" ON system_logs
    FOR UPDATE USING (false);

CREATE POLICY "deny_delete_system_logs" ON system_logs
    FOR DELETE USING (false);

-- Índices para rendimiento
CREATE INDEX idx_transacciones_timestamp ON transacciones(timestamp DESC);
CREATE INDEX idx_transacciones_hash ON transacciones(hash_transaccion);
CREATE INDEX idx_transacciones_usuario ON transacciones(usuario_id);
CREATE INDEX idx_system_logs_categoria ON system_logs(categoria);
CREATE INDEX idx_alertas_resuelta ON alertas(resuelta, severidad);
CREATE INDEX idx_inventario_caducidad ON inventarios(fecha_caducidad);
