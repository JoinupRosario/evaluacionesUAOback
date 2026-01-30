import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { login, createTestUser, changePassword } from './auth.controller.js';

const router = express.Router();

router.post('/login', login);
router.post('/create-test-user', createTestUser); // Solo para desarrollo
router.put('/change-password', authenticateToken, changePassword); // Cambiar contraseña (requiere autenticación)

export default router;
