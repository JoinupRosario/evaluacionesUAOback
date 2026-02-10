# Configuración de Azure AD / Office 365

Esta guía explica cómo configurar la autenticación con Azure AD (Office 365) para el sistema de evaluaciones UAO.

## Variables de Entorno Necesarias

Agrega las siguientes variables a tu archivo `.env` en la carpeta `backend/`:

```env
# Azure AD / Office 365 Configuration
AZURE_CLIENT_ID=0d91d93f-7c07-4932-9c5a-d7e11448aef5
AZURE_TENANT_ID=693cbea0-4ef9-4254-8977-7605cb5f556
AZURE_CLIENT_SECRET=TU_CLIENT_SECRET_AQUI

# URLs (ajusta según tu entorno)
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

### Para Producción (Vercel)

**IMPORTANTE:** Configura estas variables en las Variables de Entorno de Vercel para tu proyecto backend:

```env
# Azure AD / Office 365 Configuration
AZURE_CLIENT_ID=0d91d93f-7c07-4932-9c5a-d7e11448aef5
AZURE_TENANT_ID=693cbea0-4ef9-4254-8977-7605cb5f556
AZURE_CLIENT_SECRET=TU_CLIENT_SECRET_AQUI

# URLs de Producción
BACKEND_URL=https://tu-backend.vercel.app
FRONTEND_URL=https://evaluaciones-uao-front.vercel.app
```

## Configuración en Azure AD

### 1. Crear Client Secret (OBLIGATORIO)

El Client Secret es **obligatorio** para que la autenticación funcione. Debes crearlo en Azure AD:

1. Ve a [Azure Portal](https://portal.azure.com)
2. Azure Active Directory → App registrations → CONEXION
3. En el menú lateral, selecciona **"Certificates & secrets"** (Certificados y secretos)
4. En la sección **"Client secrets"**, haz clic en **"+ New client secret"**
5. Agrega una descripción (ej: "Secret para EvaluationUAO")
6. Selecciona la expiración (recomendado: 24 meses)
7. Haz clic en **"Add"**
8. **⚠️ IMPORTANTE:** Copia el **Value** del secret inmediatamente (solo se muestra una vez)
9. Agrega este valor a tu archivo `.env` como `AZURE_CLIENT_SECRET`

### 2. Configurar Redirect URI

**✅ El Redirect URI apunta al FRONTEND** - El frontend recibe el código de Azure AD y lo envía al backend para procesarlo.

Configura el Redirect URI en Azure AD Portal:

1. Ve a [Azure Portal](https://portal.azure.com)
2. Azure Active Directory → App registrations → CONEXION
3. Authentication → Redirect URIs
4. Haz clic en **"+ Add a platform"** → **"Web"**
5. Agrega estos URIs:

- **Desarrollo:** `http://localhost:5173/api/auth/azure/callback`
- **Producción:** `https://evaluaciones-uao-front.vercel.app/api/auth/azure/callback`

6. Haz clic en **"Configure"** para guardar

**NOTA:** El Redirect URI apunta al frontend (`/api/auth/azure/callback`), no al backend. El frontend recibe el código y lo envía al backend para procesarlo. Esta ruta está configurada en el frontend para manejar el callback de Azure AD.

### Permisos Requeridos

La aplicación debe tener los siguientes permisos configurados en Azure AD:

- `openid` - Iniciar sesión y leer el perfil del usuario
- `profile` - Leer el perfil del usuario
- `email` - Leer el email del usuario

Estos permisos deben tener **consentimiento de administrador** si es necesario.

## Flujo de Autenticación

1. El usuario hace clic en "Iniciar sesión con Office 365" en la página de login
2. El frontend redirige al backend: `/api/auth/azure`
3. El backend redirige al usuario a la página de login de Azure AD
4. El usuario ingresa sus credenciales de Office 365
5. Azure AD redirige de vuelta al **frontend**: `/api/auth/azure/callback` con un código de autorización
6. El frontend recibe el código y lo envía al backend mediante POST: `/api/auth/azure/exchange`
7. El backend intercambia el código por un token de acceso
8. El backend obtiene la información del usuario (email) desde Azure AD
9. El backend busca el usuario en MySQL por email (`user_name`, `alternate_user_name`, o `personal_email`)
10. El backend verifica que el usuario tenga roles asignados en `user_role`
11. El backend genera un JWT y lo devuelve al frontend como JSON
12. El frontend almacena el token y redirige al dashboard

## Requisitos del Usuario

Para que un usuario pueda iniciar sesión con Azure AD:

1. El usuario debe existir en la tabla `user` de MySQL
2. El email del usuario en Azure AD debe coincidir con:
   - `user_name`
   - `alternate_user_name`
   - O `personal_email`
3. El usuario debe tener `status = 'ACTIVE'`
4. El usuario debe tener al menos un registro en la tabla `user_role`

## Manejo de Errores

El sistema maneja los siguientes errores:

- **azure_login_failed**: Error al iniciar el proceso de login con Azure AD
- **azure_auth_failed**: Error durante la autenticación en Azure AD
- **no_authorization_code**: No se recibió el código de autorización
- **token_acquisition_failed**: Error al obtener el token de Azure AD
- **no_email_in_token**: No se encontró el email en el token
- **user_not_found**: El usuario no existe en MySQL
- **no_roles_assigned**: El usuario no tiene roles asignados
- **callback_error**: Error general en el callback

Todos los errores se muestran en la página de login con mensajes descriptivos.

## Dependencias

El proyecto ya incluye la dependencia necesaria:

- `@azure/msal-node`: ^5.0.2

## Notas Importantes

1. El `AZURE_CLIENT_SECRET` debe mantenerse seguro y nunca exponerse en el código fuente
2. El Redirect URI debe coincidir exactamente con el configurado en Azure AD
3. Los usuarios deben tener sus emails sincronizados entre Azure AD y MySQL
4. El sistema mantiene la compatibilidad con el login tradicional (usuario/contraseña)
