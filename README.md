# Sentinel - Sistema de Inventario de Medicamentos
## Nivel Institucional con Auditoría Inmutable

### Stack Tecnológico
- **Backend**: Django 4.2 + Django REST Framework + PostgreSQL (Supabase)
- **Frontend**: React 18 + Tailwind CSS + Axios
- **Seguridad**: RLS (Row Level Security), Hashing SHA-256, Doble Factor de Confirmación

### Características Principales

#### Fase 1: Seguridad y Legal
- ✅ Auditoría Inmutable (sin UPDATE/DELETE en transacciones)
- ✅ Row Level Security (RLS) en Supabase
- ✅ System Logs para IP, intentos fallidos, alteraciones
- ✅ Doble Factor de Confirmación (Firma + Testigo)
- ✅ Hash único SHA-256 por transacción

#### Fase 2: Operación Institucional
- ✅ Módulo de Descarte (Waste) con firma dual obligatoria
- ✅ Módulo de Daño/Incidencia con evidencia fotográfica
- ✅ Detección automática de anomalías (desvíos)
- ✅ Gestión de licencias (bloqueo si vencida)

#### Fase 3: Experiencia de Usuario
- ✅ Modo Offline (LocalStorage/IndexedDB)
- ✅ Dashboard Semáforo (Verde/Amarillo/Rojo)
- ✅ Botón de Emergencia (3 pasos: Escanear -> Administrar -> Confirmar)
- ✅ Reportes DEA en PDF

### Instalación

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# Migraciones
python manage.py makemigrations
python manage.py migrate

# Crear superusuario
python manage.py createsuperuser

# Ejecutar
python manage.py runserver
```

#### Frontend
```bash
cd frontend
npm install
npm start
```

### Configuración de Supabase
1. Crear proyecto en Supabase
2. Ejecutar `rls_policies.sql` en el SQL Editor
3. Configurar variables en `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - Credenciales de PostgreSQL

### Estructura del Hash de Transacción
```
SHA-256(usuario + testigo + caja + timestamp + tipo + cantidad + random)
```

### Licencias
El sistema bloquea automáticamente a usuarios con licencia vencida o a menos de 30 días de vencer.

### Modo Offline
Las transacciones se almacenan en `localStorage` cuando no hay conexión y se sincronizan automáticamente al recuperarla.

### Reportes
- **DEA**: PDF con todas las transacciones de narcóticos incluyendo hashes
- **Caducidades**: Lista de medicamentos próximos a vencer

### Seguridad
- Contraseñas mínimo 12 caracteres
- Bloqueo por licencia vencida
- Registro de IP y User-Agent en cada transacción
- Alertas automáticas por desvíos
