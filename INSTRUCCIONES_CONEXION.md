# Instrucciones para Conectar a MySQL (Google Cloud SQL)

## Paso 1: Configurar Variables de Entorno

Crea un archivo `.env` en la carpeta `backend/` con las siguientes variables:

```env
# MySQL - Google Cloud SQL
MYSQL_HOST=TU_IP_AQUI
MYSQL_USER=tu_usuario
MYSQL_PASSWORD=tu_contraseña
MYSQL_DB=tenant-1
MYSQL_PORT=3306

# MongoDB (local o remoto)
MONGO_URI=mongodb://localhost:27017/evaluation_db

# JWT
JWT_SECRET=tu_secret_key_super_segura_aqui

# Puerto del servidor
PORT=3000
```

## Paso 2: Verificar Conexión

1. **Asegúrate de que tu IP esté autorizada en Google Cloud SQL:**
   - Ve a Google Cloud Console
   - Cloud SQL → Tu instancia → Connections
   - Agrega tu IP pública a las redes autorizadas

2. **Verifica el nombre de la base de datos:**
   - Según el SQL, la base de datos es `tenant-1`
   - Si es diferente, actualiza `MYSQL_DB` en el `.env`

## Paso 3: Probar la Conexión

```bash
cd backend
npm install
npm run dev
```

Si todo está bien, deberías ver:
```
Servidor corriendo en puerto 3000
MongoDB conectado correctamente
```

## Estructura de Tablas que Usaremos

### Lectura (Solo lectura):
- `academic_period` - Períodos académicos
- `faculty` - Facultades  
- `program_faculty` + `program` - Programas por facultad
- `item` - Tipos de práctica (necesitamos identificar el list_id)
- `academic_practice_legalized` - Prácticas legalizadas (para después)

### Escritura:
- `evaluations` - Crear evaluaciones
- `evaluation_program` - Asociar programas a evaluaciones
- `practice_evaluation` - Guardar estados y referencias (para después)

## Endpoints Implementados

### Académicos (desde MySQL):
- `GET /api/academics/periodos` - Lista períodos
- `GET /api/academics/facultades` - Lista facultades
- `GET /api/academics/programas?facultadId=X` - Programas por facultad
- `GET /api/academics/tipos-practica` - Tipos de práctica

### Evaluaciones:
- `POST /api/evaluations` - Crear evaluación (MySQL + MongoDB)
- `GET /api/evaluations` - Listar evaluaciones (desde MySQL)
- `GET /api/evaluations/:id` - Obtener evaluación específica

## Notas Importantes

1. **Tipos de Práctica**: Por ahora están hardcodeados. Necesitamos identificar el `list_id` en la tabla `item` para obtenerlos dinámicamente.

2. **Tipo de Encuesta**: Por ahora es placeholder. Se configurará cuando creemos el módulo de formularios (tipo Google Forms).

3. **Estado Inicial**: Las evaluaciones se crean con estado `CREADA`. Cuando implementemos el envío, cambiará a `ENVIADA`.

4. **Programas**: Se guardan en `evaluation_program` como relación muchos a muchos.
