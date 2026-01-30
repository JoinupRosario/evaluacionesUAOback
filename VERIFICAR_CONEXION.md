# Cómo Verificar la Conexión a MySQL

## Paso 1: Verificar el archivo .env

Asegúrate de que el archivo `.env` en `backend/` tenga:

```env
MYSQL_HOST=35.223.9.5
MYSQL_USER=patiño
MYSQL_PASSWORD=tu_contraseña_aqui
MYSQL_DB=tenant-1
MYSQL_PORT=3306
```

**Importante**: 
- El nombre de usuario parece tener caracteres especiales (ñ). Asegúrate de que esté correcto.
- La base de datos es `tenant-1` según el SQL.

## Paso 2: Al iniciar el servidor

Ejecuta:
```bash
cd backend
npm run dev
```

Deberías ver:
```
🔌 Verificando conexiones...

✅ MySQL conectado correctamente
   Host: 35.223.9.5
   Database: tenant-1
   User: patiño
✅ Query de prueba exitosa
✅ Tabla 'academic_period' accesible (X períodos encontrados)
```

## Paso 3: Probar endpoint de verificación

Abre en el navegador:
```
http://localhost:3000/api/health/connections
```

O con curl:
```bash
curl http://localhost:3000/api/health/connections
```

## Paso 4: Probar endpoint real

Prueba obtener períodos:
```
http://localhost:3000/api/academics/periodos
```

Si devuelve datos, MySQL está funcionando correctamente.

## Errores Comunes

### Error: "Access denied for user"
- Verifica usuario y contraseña en `.env`
- El usuario puede tener caracteres especiales, asegúrate de escribirlos correctamente

### Error: "Can't connect to MySQL server"
- Verifica que la IP `35.223.9.5` sea correcta
- Verifica que el puerto `3306` sea correcto
- Verifica que tu IP esté autorizada en Google Cloud SQL

### Error: "Unknown database"
- Verifica que la base de datos sea `tenant-1` (con guión)
- Puede ser que el nombre sea diferente, verifica en HeidiSQL

## Debug

Si sigue sin funcionar, el servidor mostrará el error completo. Comparte ese mensaje para ayudarte mejor.
