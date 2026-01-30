import express from 'express';
import { getPeriodos, getFacultades, getProgramas, getTiposPractica, getTiposEncuesta, getTiposEncuestaMonitoring, getCategoriasMonitoring } from './academics.controller.js';

const router = express.Router();

router.get('/periodos', getPeriodos);
router.get('/facultades', getFacultades);
router.get('/programas', getProgramas);
router.get('/tipos-practica', getTiposPractica);
router.get('/tipos-encuesta', getTiposEncuesta);
router.get('/tipos-encuesta-monitoring', getTiposEncuestaMonitoring);
router.get('/categorias-monitoring', getCategoriasMonitoring);

export default router;
