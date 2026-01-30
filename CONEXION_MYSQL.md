# Configuración de Conexión a MySQL (Google Cloud SQL)

## Variables de Entorno Necesarias

Crea un archivo `.env` en la carpeta `backend/` con las siguientes variables:

```env
# MySQL - Google Cloud SQL
MYSQL_HOST=TU_IP_DE_GOOGLE_CLOUD_SQL
MYSQL_USER=tu_usuario
MYSQL_PASSWORD=tu_contraseña
MYSQL_DB=tenant-1
MYSQL_PORT=3306

# MongoDB
MONGO_URI=mongodb://localhost:27017/evaluation_db

# JWT
JWT_SECRET=tu_secret_key_super_segura_aqui

# Puerto del servidor
PORT=3000
```

## Pasos para Configurar

1. **Obtén las credenciales de Google Cloud SQL:**
   - IP del servidor
   - Usuario
   - Contraseña
   - Nombre de la base de datos (parece ser `tenant-1` según el SQL)

2. **Verifica la conexión:**
   - Asegúrate de que tu IP esté autorizada en Google Cloud SQL
   - Verifica que el puerto 3306 esté abierto

3. **Prueba la conexión:**
   ```bash
   cd backend
   npm run dev
   ```

## Notas Importantes

- El pool de conexiones está configurado para máximo 10 conexiones simultáneas
- La base de datos parece ser `tenant-1` según el archivo SQL
- Las tablas principales que usaremos:
  - `academic_period` - Períodos académicos
  - `faculty` - Facultades
  - `program_faculty` + `program` - Programas
  - `item` - Tipos de práctica (necesitamos identificar el list_id)
  - `evaluations` - Evaluaciones (crearemos aquí)
  - `evaluation_program` - Relación evaluación-programas
  - `academic_practice_legalized` - Prácticas legalizadas
