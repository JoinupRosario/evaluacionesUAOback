import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { login, createTestUser, changePassword, azureLogin, azureExchangeCode } from './auth.controller.js';

const router = express.Router();

router.post('/login', login);
router.get('/azure', azureLogin); // Iniciar login con Azure AD
router.post('/azure/exchange', azureExchangeCode); // Intercambiar código de Azure AD por token (llamado desde frontend)
router.post('/create-test-user', createTestUser); // Solo para desarrollo
router.put('/change-password', authenticateToken, changePassword); // Cambiar contraseña (requiere autenticación)

export default router;
