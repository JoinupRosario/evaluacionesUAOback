import jwt from 'jsonwebtoken';
import User from './models/User.js';
import pool from '../../config/mysql.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

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

    // Determinar el rol basado en is_super_admin o usar un valor por defecto
    const role = user.is_super_admin ? 'admin' : 'user';

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user.id.toString(), 
        username: user.user_name,
        email: user.personal_email || user.user_name,
        role: role
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
        role: role
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
