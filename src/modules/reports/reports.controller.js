import pool from '../../config/mysql.js';
import ExcelJS from 'exceljs';

/**
 * Reporte detallado de legalizaciones por período(s).
 * Solo Administrador General (protegido por ruta).
 * GET /api/reports/legalizaciones-detallado?periodIds=26,27,28
 * o POST con body { periodIds: [26, 27, 28] }
 * Devuelve Excel.
 */
export const getLegalizacionesDetallado = async (req, res) => {
  try {
    if (req.user?.conexion_role !== 'Administrador General') {
      return res.status(403).json({ error: 'Solo Administrador General puede descargar este reporte' });
    }
    let periodIds = req.query.periodIds || req.body?.periodIds;
    if (Array.isArray(periodIds)) {
      periodIds = periodIds.filter((id) => id != null && id !== '').map((id) => parseInt(id, 10));
    } else if (typeof periodIds === 'string') {
      periodIds = periodIds.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    } else {
      return res.status(400).json({ error: 'Se requiere periodIds (array o string separado por comas)' });
    }
    if (periodIds.length === 0) {
      return res.status(400).json({ error: 'Seleccione al menos un período' });
    }

    const placeholders = periodIds.map(() => '?').join(',');

    const [rows] = await pool.query(
      `
SELECT
    u_postulant.name                                   AS nombre_estudiante,
    u_postulant.last_name                              AS apellido_estudiante,
    u_postulant.identification                        AS identificacion,
    pp.student_code                                    AS codigo,
    prog_apl.name                                      AS programa_legalizacion,
    fac.name                                           AS facultad_programa,
    apd.period                                         AS periodo_legalizacion,
    it_practice_type.value                             AS tipo_trabajo_grado,
    COALESCE(prog_post.name, c.trade_name)             AS curso_posgrado_empresa,
    apl.date_start_practice                           AS fecha_inicio,
    apl.date_end_practice                              AS fecha_finalizacion,
    apl.status_apl                                     AS estado_legalizacion,
    apl.date_creation                                 AS fecha_creacion_legalizacion,
    apl.date_approval_apl                             AS fecha_aprobacion_legalizacion,
    apl.id_enc_note_boss                              AS nota_cualitativa,
    apl.global_note                                    AS nota_cuantitativa,
    CONCAT(u_teacher.name, ' ', u_teacher.last_name)   AS monitor,
    CONCAT(u_jury_1.name, ' ', u_jury_1.last_name)     AS jurado_1,
    CONCAT(u_jury_2.name, ' ', u_jury_2.last_name)    AS jurado_2,
    CONCAT(u_jury_3.name, ' ', u_jury_3.last_name)    AS jurado_3
FROM academic_practice_legalized apl
LEFT JOIN item it_practice_type ON apl.practice_type = it_practice_type.id
LEFT JOIN program prog_apl ON apl.program_apl = prog_apl.id
LEFT JOIN (
    SELECT program_id, MIN(faculty_id) AS faculty_id
    FROM program_faculty
    GROUP BY program_id
) pf ON prog_apl.id = pf.program_id
LEFT JOIN faculty fac ON pf.faculty_id = fac.faculty_id
LEFT JOIN program prog_post ON apl.postgraduate = prog_post.id
LEFT JOIN academic_period apd ON apl.academic_period_apl = apd.id
LEFT JOIN company c ON apl.company_apl = c.id
LEFT JOIN postulant p ON apl.postulant_apl = p.postulant_id
LEFT JOIN postulant_profile pp ON p.postulant_id = pp.postulant_id
LEFT JOIN \`user\` u_postulant ON p.postulant_id = u_postulant.id
LEFT JOIN \`user\` u_teacher ON apl.teacher = u_teacher.id
LEFT JOIN \`user\` u_jury_1 ON apl.jury_1 = u_jury_1.id
LEFT JOIN \`user\` u_jury_2 ON apl.jury_2 = u_jury_2.id
LEFT JOIN \`user\` u_jury_3 ON apl.jury_3 = u_jury_3.id
WHERE apl.academic_period_apl IN (${placeholders})
ORDER BY prog_apl.name, apd.period, u_postulant.last_name
    `,
      periodIds
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de Evaluaciones';
    const sheet = workbook.addWorksheet('Legalizaciones');
    const headerKeys = rows.length > 0 ? Object.keys(rows[0]) : [
      'nombre_estudiante', 'apellido_estudiante', 'identificacion', 'codigo',
      'programa_legalizacion', 'facultad_programa', 'periodo_legalizacion', 'tipo_trabajo_grado',
      'curso_posgrado_empresa', 'fecha_inicio', 'fecha_finalizacion', 'estado_legalizacion',
      'fecha_creacion_legalizacion', 'fecha_aprobacion_legalizacion', 'nota_cualitativa', 'nota_cuantitativa',
      'monitor', 'jurado_1', 'jurado_2', 'jurado_3'
    ];
    sheet.columns = headerKeys.map((key) => ({ header: key, key, width: 18 }));
    if (rows.length > 0) sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const filename = `detallado_legalizaciones_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
  } catch (error) {
    console.error('Error en reporte legalizaciones detallado:', error);
    res.status(500).json({ error: 'Error al generar el reporte', details: error.message });
  }
};
