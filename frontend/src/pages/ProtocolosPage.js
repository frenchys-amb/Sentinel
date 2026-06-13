import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import {
  BookOpen, Download, CheckCircle, AlertTriangle, Users,
  ClipboardList, ShieldCheck, Trash2, Clock
} from 'lucide-react';

const PROTOCOLO_SLUG = 'eliminacion-controlados';
const PROTOCOLO_VERSION = '1.0';
const PDF_URL = '/docs/protocolo-eliminacion-controlados.pdf';

const ProtocolosPage = ({ user }) => {
  const [miAcuse, setMiAcuse] = useState(null);
  const [acuses, setAcuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const esSupervisor = user?.rol === 'ADMIN' || user?.rol === 'AUDITOR';

  const fetchAcuses = useCallback(async () => {
    try {
      const res = await api.get('/protocolos/acuses/', {
        params: { protocolo: PROTOCOLO_SLUG, version: PROTOCOLO_VERSION },
      });
      const data = res.data.results || res.data;
      setAcuses(data);
      setMiAcuse(data.find(a => a.usuario === user.id) || null);
    } catch (err) {
      console.error('Error cargando acuses:', err);
    }
  }, [user.id]);

  useEffect(() => { fetchAcuses(); }, [fetchAcuses]);

  const handleAcuse = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.post('/protocolos/acuses/', {
        protocolo: PROTOCOLO_SLUG, version: PROTOCOLO_VERSION,
      });
      setMiAcuse(res.data);
      fetchAcuses();
    } catch (err) {
      setError('No se pudo registrar el acuse. Intente nuevamente.');
    } finally { setLoading(false); }
  };

  const Seccion = ({ icono: Icono, titulo, children }) => (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <Icono className="h-4.5 w-4.5 text-blue-900" />{titulo}
      </h3>
      <div className="text-sm text-gray-700 leading-relaxed space-y-2">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-900" />Protocolos
          </h1>
          <p className="text-gray-500 mt-1">Procedimientos operativos de cumplimiento</p>
        </div>
        <a href={PDF_URL} download className="btn-secondary flex items-center gap-2 text-sm">
          <Download className="h-4 w-4" />Descargar PDF
        </a>
      </div>

      {/* Estado del acuse */}
      {miAcuse ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Confirmaste la lectura de este protocolo el {new Date(miAcuse.timestamp).toLocaleString('es-PR')} (version {miAcuse.version}).
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Aun no has confirmado la lectura de este protocolo. Leelo y confirma al final de la pagina.
        </div>
      )}

      {/* Documento */}
      <div className="card space-y-6">
        <div className="text-center border-b border-gray-100 pb-5">
          <h2 className="text-lg font-bold text-gray-900 uppercase leading-snug">
            Protocolo para el Manejo y Eliminacion de Medicamentos Controlados Sobrantes y/o Expirados
          </h2>
          <p className="text-sm text-gray-500 mt-1">Frenchys Ambulance Inc. · Version {PROTOCOLO_VERSION}</p>
        </div>

        <Seccion icono={ClipboardList} titulo="Proposito">
          <p>
            Establecer los procedimientos para el manejo, documentacion, custodia y disposicion final
            de medicamentos controlados sobrantes, parcialmente utilizados, contaminados, deteriorados
            o expirados.
          </p>
        </Seccion>

        <Seccion icono={Users} titulo="Personal autorizado">
          <ul className="list-disc pl-5 space-y-1">
            <li>Jesus Castro Hernandez — Presidente</li>
            <li>Diana Rodriguez</li>
            <li>Shayda Ortiz</li>
            <li>Luis Torres</li>
          </ul>
          <p className="mt-2"><strong>Medico de Control:</strong> Dr. Roberto Velez — Lic. #14572</p>
        </Seccion>

        <Seccion icono={Trash2} titulo="Eliminacion de medicamentos controlados sobrantes (sistema Deterra)">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>El paramedico documentara la cantidad administrada y la cantidad sobrante.</li>
            <li>El sobrante sera vertido inmediatamente dentro de una bolsa Deterra.</li>
            <li>El proceso debera realizarse en presencia de un segundo empleado autorizado.</li>
            <li>Ambos empleados verificaran la cantidad eliminada.</li>
            <li>
              Se registrara en el Formulario de Desperdicio de Sustancias Controladas la fecha, hora,
              medicamento, concentracion, lote, cantidad descartada y firmas de ambos testigos.
            </li>
          </ol>
          <p className="text-xs text-blue-900 bg-blue-50 border border-blue-100 rounded-xl p-3 mt-2">
            En esta aplicacion: usa la pestaña <strong>Descarte</strong> en Transacciones — el sistema
            exige testigo y doble firma, y registra todo en la cadena de auditoria inmutable.
          </p>
        </Seccion>

        <Seccion icono={Clock} titulo="Eliminacion de medicamentos expirados">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Los medicamentos expirados seran retirados de servicio inmediatamente.</li>
            <li>Seran almacenados temporalmente en el gabinete de sustancias controladas hasta su destruccion.</li>
            <li>La destruccion se realizara utilizando bolsas Deterra aprobadas por la compañia.</li>
            <li>El contenido de la bolsa sera sellado segun las instrucciones del fabricante.</li>
            <li>Una vez completado el proceso de desactivacion, la bolsa sera descartada conforme a las regulaciones aplicables.</li>
            <li>Se conservara evidencia documental de la destruccion.</li>
          </ol>
        </Seccion>

        <Seccion icono={Users} titulo="Requisitos de testigos">
          <p>
            La destruccion de cualquier sustancia controlada requerira la presencia de
            <strong> dos personas autorizadas</strong> y la firma de ambos en el registro correspondiente.
          </p>
        </Seccion>

        <Seccion icono={ClipboardList} titulo="Registro de destruccion">
          <p>
            Toda destruccion debera incluir fecha, hora, medicamento, concentracion, cantidad destruida,
            lote, fecha de expiracion (si aplica), metodo de destruccion y firmas de los testigos.
          </p>
        </Seccion>

        <Seccion icono={ShieldCheck} titulo="Auditoria">
          <p>
            El Director de Operaciones realizara auditorias periodicas para verificar inventario, uso
            clinico, desperdicios, medicamentos expirados y registros de destruccion. Toda discrepancia
            sera investigada y documentada.
          </p>
        </Seccion>

        <div className="border-t border-gray-100 pt-4 text-sm text-gray-500">
          <p>Aprobado por: Jesus Castro Hernandez (Presidente) y Dr. Roberto Velez (Medico de Control).</p>
        </div>

        {/* Acuse */}
        {!miAcuse && (
          <div className="border-t border-gray-100 pt-5">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}
            <button onClick={handleAcuse} disabled={loading} className="w-full btn-primary py-3 disabled:opacity-50">
              {loading ? 'Registrando...' : 'He leido y entiendo este protocolo'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">
              Tu confirmacion queda registrada con fecha y hora como evidencia de auditoria.
            </p>
          </div>
        )}
      </div>

      {/* Vista de supervision: quien ha confirmado */}
      {esSupervisor && (
        <div className="card p-0 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              Acuses de lectura ({acuses.length})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Personal que ha confirmado la lectura de este protocolo</p>
          </div>
          <table className="table-pro">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Version</th><th>Fecha de confirmacion</th></tr></thead>
            <tbody>
              {acuses.map(a => (
                <tr key={a.id}>
                  <td className="font-medium text-gray-900">{a.usuario_nombre}<div className="text-xs text-gray-400">{a.usuario_username}</div></td>
                  <td><span className="badge bg-gray-100 text-gray-700 text-[10px]">{a.usuario_rol}</span></td>
                  <td className="text-gray-600">{a.version}</td>
                  <td className="text-gray-600 text-sm">{new Date(a.timestamp).toLocaleString('es-PR')}</td>
                </tr>
              ))}
              {acuses.length === 0 && (
                <tr><td colSpan="4" className="text-center text-gray-400 py-10">Nadie ha confirmado la lectura todavia</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProtocolosPage;
