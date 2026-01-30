# Crear Usuarios de Prueba

## Opción 1: Usando el Endpoint (Recomendado)

Puedes crear usuarios usando el endpoint POST `/api/auth/create-test-user`:

```bash
curl -X POST http://localhost:3000/api/auth/create-test-user \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "name": "Administrador",
    "last_name": "Sistema",
    "email": "admin@rosario.edu.co",
    "role": "admin"
  }'
```

## Usuarios de Prueba Sugeridos

### 1. Administrador
```json
{
  "username": "admin",
  "password": "admin123",
  "name": "Administrador",
  "last_name": "Sistema",
  "email": "admin@rosario.edu.co",
  "role": "admin"
}
```

### 2. Coordinador
```json
{
  "username": "coordinador",
  "password": "coord123",
  "name": "Coordinador",
  "last_name": "Prácticas",
  "email": "coordinador@rosario.edu.co",
  "role": "coordinador"
}
```

### 3. Monitor
```json
{
  "username": "monitor",
  "password": "monitor123",
  "name": "Monitor",
  "last_name": "Prácticas",
  "email": "monitor@rosario.edu.co",
  "role": "monitor"
}
```

### 4. Usuario Regular
```json
{
  "username": "usuario",
  "password": "user123",
  "name": "Usuario",
  "last_name": "Prueba",
  "email": "usuario@rosario.edu.co",
  "role": "user"
}
```

## Opción 2: Usando MongoDB Compass o mongo shell

Si prefieres crear usuarios directamente en MongoDB:

```javascript
// Conectar a MongoDB
use RosarioEvaluaciones

// Crear usuario admin
db.users.insertOne({
  username: "admin",
  email: "admin@rosario.edu.co",
  password: "$2a$10$rK8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X", // admin123 hasheado
  name: "Administrador",
  last_name: "Sistema",
  role: "admin",
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date()
})
```

**Nota**: Para obtener el hash de la contraseña, usa el endpoint de creación o bcrypt.

## Roles Disponibles

- `admin`: Acceso completo
- `coordinador`: Coordinador de prácticas
- `monitor`: Monitor de prácticas
- `user`: Usuario regular

## Verificar Usuarios Creados

Puedes verificar los usuarios creados consultando la colección `users` en MongoDB:

```javascript
db.users.find().pretty()
```
