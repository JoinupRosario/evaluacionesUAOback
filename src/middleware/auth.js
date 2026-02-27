import jwt from 'jsonwebtoken';
import pool from '../config/mysql.js';
import dotenv from 'dotenv';

dotenv.config();

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Token inválido' });
      }

      // Verificar que el usuario aún existe y está activo en MySQL
      try {
        const [users] = await pool.query(
          `SELECT id, name, last_name, user_name, personal_email, status, is_super_admin
           FROM user 
           WHERE id = ? AND status = 'ACTIVE'
           LIMIT 1`,
          [decoded.id]
        );

        if (!users || users.length === 0) {
          return res.status(403).json({ error: 'Usuario inactivo o no encontrado' });
        }

        const user = users[0];
        const role = user.is_super_admin ? 'admin' : decoded.role || 'user';

        req.user = {
          id: user.id.toString(),
          userId: user.id,
          username: user.user_name,
          email: user.personal_email || user.user_name,
          role: role,
          conexion_role: decoded.conexion_role || null,
          name: `${user.name} ${user.last_name}`
        };
        next();
      } catch (dbError) {
        console.error('Error al verificar usuario:', dbError);
        return res.status(403).json({ error: 'Error al verificar usuario' });
      }
    });
  } catch (error) {
    console.error('Error en autenticación:', error);
    return res.status(500).json({ error: 'Error en autenticación' });
  }
};
