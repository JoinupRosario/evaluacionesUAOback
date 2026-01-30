import express from 'express';
import { getEstudiantes, getTutores, getCoordinadores, getEstudianteById } from './users.controller.js';

const router = express.Router();

router.get('/estudiantes', getEstudiantes);
router.get('/estudiantes/:id', getEstudianteById);
router.get('/tutores', getTutores);
router.get('/coordinadores', getCoordinadores);

export default router;
