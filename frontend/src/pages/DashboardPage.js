import React from 'react';
import DashboardSemaforo from '../components/DashboardSemaforo';
import BotonEmergencia from '../components/BotonEmergencia';
import { MapPin, BadgeCheck } from 'lucide-react';

const DashboardPage = ({ user }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Monitoreo en tiempo real del inventario</p>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <MapPin className="h-4 w-4" />
            <span>{user.unidad_asignada || 'Sin unidad'}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <BadgeCheck className="h-4 w-4" />
            <span>{user.numero_licencia || 'N/A'}</span>
          </div>
        </div>
      </div>

      <DashboardSemaforo />
      <BotonEmergencia user={user} />
    </div>
  );
};

export default DashboardPage;
