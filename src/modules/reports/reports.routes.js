import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getLegalizacionesDetallado } from './reports.controller.js';

const router = Router();

// Solo Administrador General puede acceder (se valida en controller o middleware adicional si se desea)
router.get('/legalizaciones-detallado', authenticateToken, getLegalizacionesDetallado);
router.post('/legalizaciones-detallado', authenticateToken, getLegalizacionesDetallado);

export default router;
