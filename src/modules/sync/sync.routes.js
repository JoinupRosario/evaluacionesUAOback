import express from 'express';
import { syncStudents, syncBosses, syncMonitors } from './sync.controller.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

router.post('/students', authenticateToken, syncStudents);
router.post('/bosses', authenticateToken, syncBosses);
router.post('/monitors', authenticateToken, syncMonitors);

export default router;
