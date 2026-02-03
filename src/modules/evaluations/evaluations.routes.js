import express from 'express';
import {
  createEvaluation,
  createMonitoringEvaluation,
  updateMonitoringEvaluation,
  getEvaluations,
  getMonitoringEvaluations,
  getMonitoringEvaluationById,
  getEvaluationById,
  getEvaluationMongoDetails,
  updateEvaluation,
  updateTokenShouldSend,
  createQuestion,
  getQuestionsByEvaluation,
  generateTokens,
  getEvaluationByToken,
  submitAnswers,
  getResults,
  getStudents,
  createPracticeEvaluation,
  submitPracticeEvaluationAnswers,
  sendPracticeEvaluation,
  getPracticeEvaluationResults,
  getEvaluationByAccessToken,
  submitEvaluationResponse,
  getEvaluationResponse,
  testEmailTemplates,
  exportEvaluationReport
} from './evaluations.controller.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

// Rutas públicas para responder evaluaciones (sin autenticación)
router.get('/access-token/:token', getEvaluationByAccessToken);
router.post('/access-token/submit', submitEvaluationResponse);

// Rutas para evaluaciones generales
router.post('/', authenticateToken, createEvaluation);
router.post('/monitoring', authenticateToken, createMonitoringEvaluation);
router.get('/', authenticateToken, getEvaluations);
router.get('/monitoring', authenticateToken, getMonitoringEvaluations);
router.get('/students', authenticateToken, getStudents);
router.get('/monitoring/:id', authenticateToken, getMonitoringEvaluationById);
router.get('/:id/mongo', authenticateToken, getEvaluationMongoDetails);
router.put('/:id/tokens/should-send', authenticateToken, updateTokenShouldSend);
router.get('/:id/response', authenticateToken, getEvaluationResponse);
router.get('/:id/export', authenticateToken, exportEvaluationReport);
router.post('/:id/test-templates', authenticateToken, testEmailTemplates);
router.get('/:id', authenticateToken, getEvaluationById);
router.put('/:id', authenticateToken, updateEvaluation);
router.put('/monitoring/:id', authenticateToken, updateMonitoringEvaluation);
router.post('/:id/preguntas', authenticateToken, createQuestion);
router.get('/:id/preguntas', authenticateToken, getQuestionsByEvaluation);
router.get('/:id/resultados', authenticateToken, getResults);
router.post('/tokens', authenticateToken, generateTokens);
router.get('/token/:token', getEvaluationByToken);
router.post('/responder', submitAnswers);

// Rutas para evaluaciones de prácticas (múltiples actores)
router.post('/practice', authenticateToken, createPracticeEvaluation);
router.post('/practice/submit', submitPracticeEvaluationAnswers);
router.post('/practice/send', authenticateToken, sendPracticeEvaluation);
router.get('/practice/:evaluation_id/results', authenticateToken, getPracticeEvaluationResults);

export default router;
