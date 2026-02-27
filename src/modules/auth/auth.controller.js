import jwt from 'jsonwebtoken';
import User from './models/User.js';
import pool from '../../config/mysql.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { ConfidentialClientApplication } from '@azure/msal-node';

dotenv.config();

// Roles de CONEXIÓN (tabla role) que tienen acceso al sistema de evaluaciones
const ROLES_CON_ACCESO_EVALUACIONES = [
  'Monitor de práctica',
  'Coordinador prácticas Pasantías',
  'Administrador General'
];

// Función para crear usuario de prueba (solo desarrollo)
export const createTestUser = async (req, res) => {
  try {
    const { username, password, name, last_name, email, role } = req.body;

    if (!username || !password || !name || !last_name || !email) {
      return res.status(400).json({ 
        error: 'username, password, name, last_name y email son requeridos' 
      });
    }

    // Verificar si el usuario ya existe
    const existing = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email.toLowerCase() }
      ]
    });

    if (existing) {
      return res.status(400).json({ error: 'El usuario o email ya existe' });
    }

    // Crear usuario (el hash se hace automáticamente en el pre-save)
    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password, // Se hasheará automáticamente
      name,
      last_name,
      role: role || 'user',
      status: 'ACTIVE'
    });

    await user.save();

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: `${user.name} ${user.last_name}`,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El usuario o email ya existe' });
    }
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email/Usuario y contraseña son requeridos' });
    }

    // Buscar usuario en MySQL por user_name o alternate_user_name
    // COMENTADO: it_has_encryption_in_SHA256 ya no se consulta - Ahora se usa MD5
    const [users] = await pool.query(
      `SELECT id, name, last_name, user_name, alternate_user_name, password_hash, 
              personal_email, status, is_super_admin
       FROM user 
       WHERE (user_name = ? OR alternate_user_name = ?) 
         AND status = 'ACTIVE'
         AND password_hash IS NOT NULL
       LIMIT 1`,
      [email, email]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = users[0];

    // Verificar que el password esté en MD5
    // COMENTADO: Verificación de it_has_encryption_in_SHA256 eliminada - Ahora se usa MD5
    // if (!user.it_has_encryption_in_SHA256) {
    //   return res.status(401).json({ error: 'El usuario no tiene contraseña configurada correctamente' });
    // }

    // Generar MD5 del password ingresado
    const passwordHash = crypto.createHash('md5').update(password).digest('hex');

    // Comparar el hash
    if (passwordHash.toLowerCase() !== user.password_hash.toLowerCase()) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    let conexionRoleName = null;
    if (!user.is_super_admin) {
      const placeholders = ROLES_CON_ACCESO_EVALUACIONES.map(() => '?').join(', ');
      const [userRoles] = await pool.query(
        `SELECT ur.user_id, r.name AS role_name FROM user_role ur
         INNER JOIN role r ON ur.role_id = r.id
         WHERE ur.user_id = ? AND r.name IN (${placeholders})
         LIMIT 1`,
        [user.id, ...ROLES_CON_ACCESO_EVALUACIONES]
      );
      if (!userRoles || userRoles.length === 0) {
        return res.status(403).json({
          error: 'Acceso denegado: no tienes un rol autorizado. Roles permitidos: Monitor de práctica, Coordinador prácticas Pasantías o Administrador General.'
        });
      }
      conexionRoleName = userRoles[0].role_name;
    } else {
      conexionRoleName = 'Administrador General';
    }

    // Determinar el rol basado en is_super_admin o usar un valor por defecto
    const role = user.is_super_admin ? 'admin' : 'user';

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user.id.toString(), 
        username: user.user_name,
        email: user.personal_email || user.user_name,
        role: role,
        conexion_role: conexionRoleName
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.user_name,
        email: user.personal_email || user.user_name,
        name: `${user.name} ${user.last_name}`,
        role: role,
        conexion_role: conexionRoleName
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Cambiar contraseña del usuario
export const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user_email = req.user?.email || req.user?.username;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'La contraseña actual y la nueva contraseña son requeridas' });
    }

    if (current_password === new_password) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // Buscar usuario en MySQL por email o username
    // COMENTADO: it_has_encryption_in_SHA256 ya no se consulta - Ahora se usa MD5
    const [users] = await pool.query(
      `SELECT id, password_hash, user_name, alternate_user_name, personal_email
       FROM user 
       WHERE (user_name = ? OR alternate_user_name = ? OR personal_email = ?)
         AND status = 'ACTIVE'
         AND password_hash IS NOT NULL
       LIMIT 1`,
      [user_email, user_email, user_email]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = users[0];

    // Verificar que el password esté en MD5
    // COMENTADO: Verificación de it_has_encryption_in_SHA256 eliminada - Ahora se usa MD5
    // if (!user.it_has_encryption_in_SHA256) {
    //   return res.status(400).json({ error: 'El usuario no tiene contraseña configurada correctamente' });
    // }

    // Verificar la contraseña actual
    const currentPasswordHash = crypto.createHash('md5').update(current_password).digest('hex');
    if (currentPasswordHash.toLowerCase() !== user.password_hash.toLowerCase()) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    // Generar MD5 de la nueva contraseña
    const newPasswordHash = crypto.createHash('md5').update(new_password).digest('hex');

    // Obtener el email del usuario logeado para auditoría
    const user_updater = req.user?.email || req.user?.username || 'system';
    const date_update = new Date();

    // Actualizar contraseña en MySQL
    // COMENTADO: it_has_encryption_in_SHA256 ya no se actualiza - Ahora se usa MD5
    await pool.query(
      `UPDATE user 
       SET password_hash = ?,
           user_updater = ?,
           date_update = ?
       WHERE id = ?`,
      [newPasswordHash, user_updater, date_update, user.id]
    );

    res.json({
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
};

// Función para obtener la instancia de MSAL (lazy initialization)
let pca = null;

const getMSALInstance = () => {
  if (!pca) {
    // Verificar que las variables de entorno estén configuradas
    if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_SECRET) {
      throw new Error('Azure AD credentials not configured. Please set AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET in your .env file.');
    }

    const msalConfig = {
      auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      },
    };

    pca = new ConfidentialClientApplication(msalConfig);
  }
  return pca;
};

// Iniciar login con Azure AD
export const azureLogin = async (req, res) => {
  try {
    const msalInstance = getMSALInstance();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    // El redirect URI apunta al frontend con la ruta que el cliente configuró en Azure AD
    const redirectUri = `${frontendUrl}/api/auth/azure/callback`;

    // Generar URL de autorización
    const authCodeUrlParameters = {
      scopes: ['openid', 'profile', 'email'],
      redirectUri: redirectUri,
      prompt: 'login', // Forzar pantalla de login aunque haya sesión activa en Azure
    };

    const authUrl = await msalInstance.getAuthCodeUrl(authCodeUrlParameters);
    
    // Redirigir al usuario a Azure AD
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error al iniciar login con Azure AD:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=azure_login_failed&message=${encodeURIComponent(error.message)}`);
  }
};

// Intercambiar código de Azure AD por token (llamado desde el frontend)
export const azureExchangeCode = async (req, res) => {
  try {
    const { code } = req.body;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUri = `${frontendUrl}/api/auth/azure/callback`;

    if (!code) {
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    // Intercambiar código por token
    const msalInstance = getMSALInstance();
    const tokenRequest = {
      code: code,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: redirectUri,
    };

    const response = await msalInstance.acquireTokenByCode(tokenRequest);
    
    if (!response || !response.account) {
      return res.status(400).json({ error: 'Error al obtener el token de Azure AD' });
    }

    const azureUser = response.account;
    // Obtener email del account o de las claims del ID token
    const email = azureUser.username || 
                   azureUser.name || 
                   (response.idTokenClaims && response.idTokenClaims.email) ||
                   (response.idTokenClaims && response.idTokenClaims.preferred_username);

    console.log('[Azure] Datos recibidos del token:', {
      username: azureUser.username,
      name: azureUser.name,
      homeAccountId: azureUser.homeAccountId,
      email_claim: response.idTokenClaims?.email,
      preferred_username: response.idTokenClaims?.preferred_username,
      upn: response.idTokenClaims?.upn,
      email_resuelto: email
    });

    if (!email) {
      console.error('No se pudo obtener el email del usuario de Azure AD:', {
        account: azureUser,
        idTokenClaims: response.idTokenClaims
      });
      return res.status(400).json({ error: 'No se encontró el email en el token de Azure AD' });
    }

    // Buscar usuario en MySQL por email (user_name, alternate_user_name o personal_email)
    const [users] = await pool.query(
      `SELECT id, name, last_name, user_name, alternate_user_name, personal_email, status, is_super_admin
       FROM user 
       WHERE (user_name = ? OR alternate_user_name = ? OR personal_email = ?)
         AND status = 'ACTIVE'
       LIMIT 1`,
      [email, email, email]
    );

    console.log(`[Azure] Búsqueda por email "${email}" → ${users?.length ?? 0} resultado(s)`);

    if (!users || users.length === 0) {
      // Intentar búsqueda parcial para diagnóstico (solo en logs)
      try {
        const emailLocal = email.split('@')[0];
        const [hint] = await pool.query(
          `SELECT id, user_name, alternate_user_name, personal_email FROM user WHERE user_name LIKE ? OR alternate_user_name LIKE ? LIMIT 3`,
          [`%${emailLocal}%`, `%${emailLocal}%`]
        );
        console.warn(`[Azure] Usuario no encontrado. Email Azure: "${email}". Sugerencias BD (parte local "${emailLocal}"):`, hint);
      } catch(e) { /* diagnóstico opcional */ }

      return res.status(404).json({ 
        error: 'Usuario no encontrado',
        email: email 
      });
    }

    const user = users[0];

    // Super admin siempre tiene acceso; resto debe tener al menos uno de los roles permitidos
    let conexionRoleName = null;
    if (!user.is_super_admin) {
      const placeholders = ROLES_CON_ACCESO_EVALUACIONES.map(() => '?').join(', ');
      const [userRoles] = await pool.query(
        `SELECT ur.user_id, r.id AS role_id, r.name AS role_name
         FROM user_role ur
         INNER JOIN role r ON ur.role_id = r.id
         WHERE ur.user_id = ? AND r.name IN (${placeholders})
         LIMIT 1`,
        [user.id, ...ROLES_CON_ACCESO_EVALUACIONES]
      );

      if (!userRoles || userRoles.length === 0) {
        console.warn(`[Azure] Acceso denegado: usuario ${user.id} (${user.user_name}) no tiene ninguno de los roles: ${ROLES_CON_ACCESO_EVALUACIONES.join(', ')}`);
        return res.status(403).json({
          error: 'Acceso denegado: no tienes un rol autorizado para el sistema de evaluaciones. Los roles permitidos son: Monitor de práctica, Coordinador prácticas Pasantías o Administrador General.'
        });
      }
      conexionRoleName = userRoles[0].role_name;
    } else {
      conexionRoleName = 'Administrador General';
    }

    // Determinar el rol para el JWT
    const role = user.is_super_admin ? 'admin' : 'user';

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user.id.toString(), 
        username: user.user_name,
        email: user.personal_email || user.user_name,
        role: role,
        conexion_role: conexionRoleName
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Devolver el token y datos del usuario como JSON
    res.json({
      token,
      user: {
        id: user.id,
        username: user.user_name,
        email: user.personal_email || user.user_name,
        name: `${user.name} ${user.last_name}`,
        role: role,
        conexion_role: conexionRoleName
      }
    });
  } catch (error) {
    console.error('Error al intercambiar código de Azure AD:', error);
    
    // Manejar errores específicos de Azure AD
    if (error.errorCode === 'invalid_grant' || error.message?.includes('already redeemed')) {
      return res.status(400).json({ 
        error: 'El código de autorización ya fue utilizado o ha expirado. Por favor, intenta iniciar sesión nuevamente.',
        code: 'code_already_used'
      });
    }
    
    res.status(500).json({ 
      error: 'Error al procesar la autenticación',
      message: error.message || 'Error desconocido'
    });
  }
};
