import pool from '../src/config/mysql.js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔧 Cambia este valor para exportar otra evaluación
const EVALUATION_ID = 309;

/**
 * Script para exportar datos de una evaluación a Excel
 * Extrae todos los datos de practice_evaluation y mapea las preguntas y respuestas
 */
async function exportEvaluationToExcel() {
  let connection;
  
  try {
    console.log(`🔍 Iniciando exportación de evaluación ${EVALUATION_ID}...\n`);
    
    // Conectar a MySQL
    connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL\n');

    // 1. Obtener información de la evaluación con nombres reales
    const [evaluationInfo] = await connection.query(`
      SELECT 
        e.evaluation_id,
        e.name,
        ap.period as period_name,
        e.period as period_id,
        COALESCE(i_survey.value, i_survey.value_for_reports, CAST(e.type_survey AS CHAR)) as type_survey_name,
        e.type_survey as type_survey_id,
        COALESCE(i_practice.value, i_practice.value_for_reports, CAST(e.practice_type AS CHAR)) as practice_type_name,
        e.practice_type as practice_type_id,
        COALESCE(f.name, CAST(e.faculty_id AS CHAR)) as faculty_name,
        e.faculty_id,
        e.total_bosses,
        e.total_students,
        e.total_monitors,
        e.percentage_bosses,
        e.percentage_students,
        e.percentage_monitors,
        e.start_date,
        e.finish_date,
        e.status,
        e.date_sent,
        e.date_creation,
        e.user_creator
      FROM evaluations e
      LEFT JOIN academic_period ap ON e.period = ap.id
      LEFT JOIN item i_survey ON e.type_survey = i_survey.id
      LEFT JOIN item i_practice ON e.practice_type = i_practice.id
      LEFT JOIN faculty f ON e.faculty_id = f.faculty_id
      WHERE e.evaluation_id = ?
    `, [EVALUATION_ID]);

    if (evaluationInfo.length === 0) {
      throw new Error(`❌ No se encontró la evaluación ${EVALUATION_ID}`);
    }

    const evaluation = evaluationInfo[0];
    console.log(`📋 Evaluación encontrada: ${evaluation.name}`);
    console.log(`   ID: ${evaluation.evaluation_id}`);
    console.log(`   Período: ${evaluation.period_name || evaluation.period_id}`);
    console.log(`   Estado: ${evaluation.status}\n`);

    // 2. Obtener todos los registros de practice_evaluation para esta evaluación con información completa
    const [practiceEvaluations] = await connection.query(`
      SELECT 
        pe.id,
        pe.academic_practice_legalized_id,
        pe.evaluation_id,
        pe.med_boss_status,
        pe.med_student_status,
        pe.med_monitor_status,
        pe.med_boss_data,
        pe.med_student_data,
        pe.med_monitor_data,
        pe.last_date_send_boss,
        pe.last_date_send_student,
        pe.last_date_send_monitor,
        pe.last_date_answer_boss,
        pe.last_date_answer_student,
        pe.last_date_answer_monitor,
        -- Información del estudiante
        CONCAT(u_student.name, ' ', u_student.last_name) as student_name,
        COALESCE(NULLIF(u_student.personal_email, ''), p.alternate_email) as student_email,
        u_student.user_name as student_code,
        -- Información del jefe
        CONCAT(pb.first_name, ' ', pb.last_name) as boss_name,
        pb.email as boss_email,
        pb.job as boss_job,
        pb.phone_number as boss_phone,
        -- Información de la empresa
        COALESCE(c.trade_name, c.business_name) as company_name,
        -- Información del programa (usar program a través de program_faculty)
        pr.name as program_name,
        -- Información de monitores
        CONCAT(u_monitor1.name, ' ', u_monitor1.last_name) as monitor1_name,
        COALESCE(NULLIF(u_monitor1.personal_email, ''), u_monitor1.user_name) as monitor1_email,
        CONCAT(u_monitor2.name, ' ', u_monitor2.last_name) as monitor2_name,
        COALESCE(NULLIF(u_monitor2.personal_email, ''), u_monitor2.user_name) as monitor2_email,
        -- Información de la legalización
        apl.academic_practice_legalized_id,
        apl.date_start_practice,
        apl.date_end_practice,
        apl.status_apl
      FROM practice_evaluation pe
      LEFT JOIN academic_practice_legalized apl 
        ON pe.academic_practice_legalized_id = apl.academic_practice_legalized_id
      LEFT JOIN postulant p 
        ON apl.postulant_apl = p.postulant_id
      LEFT JOIN user u_student 
        ON p.postulant_id = u_student.id
      LEFT JOIN practice_boss pb 
        ON apl.boss_apl = pb.boss_id
      LEFT JOIN company c 
        ON apl.company_apl = c.id
      LEFT JOIN program_faculty pf 
        ON apl.program_apl = pf.program_faculty_id
      LEFT JOIN program pr 
        ON pf.program_id = pr.id
      LEFT JOIN user u_monitor1 
        ON apl.user_tutor = u_monitor1.id
      LEFT JOIN user u_monitor2 
        ON apl.user_tutor_2 = u_monitor2.id
      WHERE pe.evaluation_id = ?
      ORDER BY pe.academic_practice_legalized_id
    `, [EVALUATION_ID]);

    console.log(`📊 Registros encontrados: ${practiceEvaluations.length}\n`);

    if (practiceEvaluations.length === 0) {
      throw new Error(`❌ No se encontraron registros de practice_evaluation para la evaluación ${EVALUATION_ID}`);
    }

    // 3. Crear el workbook de Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de Evaluaciones';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Hoja 1: Resumen de la evaluación
    const summarySheet = workbook.addWorksheet('Resumen Evaluación');
    summarySheet.columns = [
      { header: 'Campo', key: 'field', width: 30 },
      { header: 'Valor', key: 'value', width: 50 }
    ];
    
    summarySheet.addRows([
      { field: 'ID Evaluación', value: evaluation.evaluation_id },
      { field: 'Nombre', value: evaluation.name },
      { field: 'Período', value: evaluation.period_name || evaluation.period_id },
      { field: 'Tipo Encuesta', value: evaluation.type_survey_name || evaluation.type_survey_id },
      { field: 'Tipo Práctica', value: evaluation.practice_type_name || evaluation.practice_type_id },
      { field: 'Facultad', value: evaluation.faculty_name || evaluation.faculty_id },
      { field: 'Total Jefes', value: evaluation.total_bosses },
      { field: 'Total Estudiantes', value: evaluation.total_students },
      { field: 'Total Monitores', value: evaluation.total_monitors },
      { field: '% Jefes', value: evaluation.percentage_bosses },
      { field: '% Estudiantes', value: evaluation.percentage_students },
      { field: '% Monitores', value: evaluation.percentage_monitors },
      { field: 'Fecha Inicio', value: evaluation.start_date ? new Date(evaluation.start_date).toLocaleDateString('es-ES') : '' },
      { field: 'Fecha Fin', value: evaluation.finish_date ? new Date(evaluation.finish_date).toLocaleDateString('es-ES') : '' },
      { field: 'Estado', value: evaluation.status },
      { field: 'Fecha Envío', value: evaluation.date_sent ? new Date(evaluation.date_sent).toLocaleString('es-ES') : '' },
      { field: 'Fecha Creación', value: evaluation.date_creation ? new Date(evaluation.date_creation).toLocaleString('es-ES') : '' },
      { field: 'Usuario Creador', value: evaluation.user_creator }
    ]);

    // Aplicar formato a la hoja de resumen
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Hoja 2: Datos de Jefes (Boss)
    const bossSheet = workbook.addWorksheet('Respuestas Jefes');
    bossSheet.columns = [
      { header: 'ID Legalización', key: 'legalization_id', width: 15 },
      { header: 'Estudiante', key: 'student_name', width: 30 },
      { header: 'Código Estudiante', key: 'student_code', width: 20 },
      { header: 'Correo Estudiante', key: 'student_email', width: 30 },
      { header: 'Programa', key: 'program_name', width: 30 },
      { header: 'Empresa', key: 'company_name', width: 30 },
      { header: 'Jefe', key: 'boss_name', width: 30 },
      { header: 'Cargo Jefe', key: 'boss_job', width: 25 },
      { header: 'Correo Jefe', key: 'boss_email', width: 30 },
      { header: 'Teléfono Jefe', key: 'boss_phone', width: 15 },
      { header: 'Fecha Inicio Práctica', key: 'date_start', width: 20 },
      { header: 'Fecha Fin Práctica', key: 'date_end', width: 20 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Fecha Envío', key: 'date_send', width: 20 },
      { header: 'Fecha Respuesta', key: 'date_answer', width: 20 },
      { header: 'ID Pregunta', key: 'question_id', width: 15 },
      { header: 'Pregunta', key: 'question', width: 50 },
      { header: 'Respuesta', key: 'answer', width: 50 }
    ];

    // Hoja 3: Datos de Estudiantes
    const studentSheet = workbook.addWorksheet('Respuestas Estudiantes');
    studentSheet.columns = [
      { header: 'ID Legalización', key: 'legalization_id', width: 15 },
      { header: 'Estudiante', key: 'student_name', width: 30 },
      { header: 'Código Estudiante', key: 'student_code', width: 20 },
      { header: 'Correo Estudiante', key: 'student_email', width: 30 },
      { header: 'Programa', key: 'program_name', width: 30 },
      { header: 'Empresa', key: 'company_name', width: 30 },
      { header: 'Jefe', key: 'boss_name', width: 30 },
      { header: 'Monitor 1', key: 'monitor1_name', width: 30 },
      { header: 'Monitor 2', key: 'monitor2_name', width: 30 },
      { header: 'Fecha Inicio Práctica', key: 'date_start', width: 20 },
      { header: 'Fecha Fin Práctica', key: 'date_end', width: 20 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Fecha Envío', key: 'date_send', width: 20 },
      { header: 'Fecha Respuesta', key: 'date_answer', width: 20 },
      { header: 'ID Pregunta', key: 'question_id', width: 15 },
      { header: 'Pregunta', key: 'question', width: 50 },
      { header: 'Respuesta', key: 'answer', width: 50 }
    ];

    // Hoja 4: Datos de Monitores
    const monitorSheet = workbook.addWorksheet('Respuestas Monitores');
    monitorSheet.columns = [
      { header: 'ID Legalización', key: 'legalization_id', width: 15 },
      { header: 'Estudiante', key: 'student_name', width: 30 },
      { header: 'Código Estudiante', key: 'student_code', width: 20 },
      { header: 'Programa', key: 'program_name', width: 30 },
      { header: 'Empresa', key: 'company_name', width: 30 },
      { header: 'Monitor', key: 'monitor_name', width: 30 },
      { header: 'Correo Monitor', key: 'monitor_email', width: 30 },
      { header: 'Tipo Monitor', key: 'monitor_type', width: 15 },
      { header: 'Fecha Inicio Práctica', key: 'date_start', width: 20 },
      { header: 'Fecha Fin Práctica', key: 'date_end', width: 20 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Fecha Envío', key: 'date_send', width: 20 },
      { header: 'Fecha Respuesta', key: 'date_answer', width: 20 },
      { header: 'ID Pregunta', key: 'question_id', width: 15 },
      { header: 'Pregunta', key: 'question', width: 50 },
      { header: 'Respuesta', key: 'answer', width: 50 }
    ];

    // Función para parsear JSON y extraer preguntas/respuestas
    function parseEvaluationData(jsonData, actorType) {
      if (!jsonData || jsonData.trim() === '') return [];
      
      try {
        const data = JSON.parse(jsonData);
        if (!Array.isArray(data) || data.length === 0) return [];
        
        return data.map((item, index) => {
          // Estructura real del JSON:
          // medPreId, medPrePregunta, medResId, medResRespuesta, medEncResAbierta
          const questionId = item.medPreId || item.id || item.question_id || item.pregunta_id || (index + 1);
          let question = item.medPrePregunta || item.pregunta || item.question || item.texto || '';
          
          // Respuesta cerrada/seleccionada (medResRespuesta: "Bueno", "Excelente", etc.)
          const closedAnswer = item.medResRespuesta || item.respuesta || item.answer || item.valor || '';
          // Respuesta abierta (texto libre) - medEncResAbierta
          const openAnswer = item.medEncResAbierta || item.respuesta_abierta || item.texto_libre || '';
          // ID de la respuesta seleccionada
          const answerId = item.medResId || item.respuesta_id || '';
          
          // Combinar respuesta cerrada y abierta
          let fullAnswer = '';
          if (closedAnswer && openAnswer && openAnswer.trim() !== '') {
            // Si hay ambas, combinar con separador
            fullAnswer = `${closedAnswer} - ${openAnswer}`;
          } else if (closedAnswer) {
            fullAnswer = closedAnswer;
          } else if (openAnswer && openAnswer.trim() !== '') {
            fullAnswer = openAnswer;
          }
          
          // Si la pregunta está en formato JSON (como en la imagen: "[{...}]"), intentar parsearla
          if (typeof question === 'string' && question.trim().startsWith('[')) {
            try {
              const qParsed = JSON.parse(question);
              if (Array.isArray(qParsed) && qParsed.length > 0) {
                // Si es un array, tomar el texto de la primera pregunta
                question = qParsed[0].texto || qParsed[0].pregunta || qParsed[0].question || JSON.stringify(qParsed);
              } else {
                question = JSON.stringify(qParsed);
              }
            } catch (e) {
              // Mantener el original si no se puede parsear
            }
          }
          
          return {
            question_id: questionId,
            question: question,
            answer: fullAnswer,
            answer_id: answerId,
            closed_answer: closedAnswer,
            open_answer: openAnswer
          };
        });
      } catch (error) {
        console.warn(`⚠️  Error al parsear JSON para ${actorType}:`, error.message);
        if (jsonData && jsonData.length > 0) {
          console.warn(`   Primeros 200 caracteres: ${jsonData.substring(0, 200)}...`);
        }
        return [];
      }
    }

    // Procesar cada registro - MOSTRAR TODOS, incluso sin respuestas
    let bossCount = 0;
    let studentCount = 0;
    let monitorCount = 0;
    let bossWithAnswers = 0;
    let studentWithAnswers = 0;
    let monitorWithAnswers = 0;

    for (const record of practiceEvaluations) {
      const legalizationId = record.academic_practice_legalized_id;
      const recordId = record.id;

      // Procesar JEFES - MOSTRAR TODOS, incluso sin respuestas
      if (record.med_boss_status || record.boss_name) {
        bossCount++;
        const bossAnswers = record.med_boss_data ? parseEvaluationData(record.med_boss_data, 'boss') : [];
        
        if (bossAnswers.length > 0) {
          bossWithAnswers++;
          // Si hay respuestas, mostrar cada pregunta/respuesta en una fila
          bossAnswers.forEach((answer, index) => {
            bossSheet.addRow({
              legalization_id: index === 0 ? legalizationId : '',
              student_name: index === 0 ? (record.student_name || '') : '',
              student_code: index === 0 ? (record.student_code || '') : '',
              student_email: index === 0 ? (record.student_email || '') : '',
              program_name: index === 0 ? (record.program_name || '') : '',
              company_name: index === 0 ? (record.company_name || '') : '',
              boss_name: index === 0 ? (record.boss_name || '') : '',
              boss_job: index === 0 ? (record.boss_job || '') : '',
              boss_email: index === 0 ? (record.boss_email || '') : '',
              boss_phone: index === 0 ? (record.boss_phone ? String(record.boss_phone) : '') : '',
              date_start: index === 0 ? (record.date_start_practice ? new Date(record.date_start_practice).toLocaleDateString('es-ES') : '') : '',
              date_end: index === 0 ? (record.date_end_practice ? new Date(record.date_end_practice).toLocaleDateString('es-ES') : '') : '',
              status: index === 0 ? (record.med_boss_status || '') : '',
              date_send: index === 0 ? (record.last_date_send_boss ? new Date(record.last_date_send_boss).toLocaleString('es-ES') : '') : '',
              date_answer: index === 0 ? (record.last_date_answer_boss ? new Date(record.last_date_answer_boss).toLocaleString('es-ES') : '') : '',
              question_id: answer.question_id,
              question: answer.question,
              answer: answer.answer || (answer.closed_answer || '') + (answer.open_answer ? (answer.closed_answer ? ' - ' : '') + answer.open_answer : '')
            });
          });
        } else {
          // Si NO hay respuestas, mostrar una fila con información básica pero sin preguntas/respuestas
          bossSheet.addRow({
            legalization_id: legalizationId,
            student_name: record.student_name || '',
            student_code: record.student_code || '',
            student_email: record.student_email || '',
            program_name: record.program_name || '',
            company_name: record.company_name || '',
            boss_name: record.boss_name || '',
            boss_job: record.boss_job || '',
            boss_email: record.boss_email || '',
            boss_phone: record.boss_phone ? String(record.boss_phone) : '',
            date_start: record.date_start_practice ? new Date(record.date_start_practice).toLocaleDateString('es-ES') : '',
            date_end: record.date_end_practice ? new Date(record.date_end_practice).toLocaleDateString('es-ES') : '',
            status: record.med_boss_status || '',
            date_send: record.last_date_send_boss ? new Date(record.last_date_send_boss).toLocaleString('es-ES') : '',
            date_answer: record.last_date_answer_boss ? new Date(record.last_date_answer_boss).toLocaleString('es-ES') : '',
            question_id: '',
            question: 'SIN RESPUESTAS',
            answer: ''
          });
        }
      }

      // Procesar ESTUDIANTES - MOSTRAR TODOS, incluso sin respuestas
      if (record.med_student_status || record.student_name) {
        studentCount++;
        const studentAnswers = record.med_student_data ? parseEvaluationData(record.med_student_data, 'student') : [];
        
        if (studentAnswers.length > 0) {
          studentWithAnswers++;
          // Si hay respuestas, mostrar cada pregunta/respuesta en una fila
          studentAnswers.forEach((answer, index) => {
            studentSheet.addRow({
              legalization_id: index === 0 ? legalizationId : '',
              student_name: index === 0 ? (record.student_name || '') : '',
              student_code: index === 0 ? (record.student_code || '') : '',
              student_email: index === 0 ? (record.student_email || '') : '',
              program_name: index === 0 ? (record.program_name || '') : '',
              company_name: index === 0 ? (record.company_name || '') : '',
              boss_name: index === 0 ? (record.boss_name || '') : '',
              monitor1_name: index === 0 ? (record.monitor1_name || '') : '',
              monitor2_name: index === 0 ? (record.monitor2_name || '') : '',
              date_start: index === 0 ? (record.date_start_practice ? new Date(record.date_start_practice).toLocaleDateString('es-ES') : '') : '',
              date_end: index === 0 ? (record.date_end_practice ? new Date(record.date_end_practice).toLocaleDateString('es-ES') : '') : '',
              status: index === 0 ? (record.med_student_status || '') : '',
              date_send: index === 0 ? (record.last_date_send_student ? new Date(record.last_date_send_student).toLocaleString('es-ES') : '') : '',
              date_answer: index === 0 ? (record.last_date_answer_student ? new Date(record.last_date_answer_student).toLocaleString('es-ES') : '') : '',
              question_id: answer.question_id,
              question: answer.question,
              answer: answer.answer || (answer.closed_answer || '') + (answer.open_answer ? (answer.closed_answer ? ' - ' : '') + answer.open_answer : '')
            });
          });
        } else {
          // Si NO hay respuestas, mostrar una fila con información básica pero sin preguntas/respuestas
          studentSheet.addRow({
            legalization_id: legalizationId,
            student_name: record.student_name || '',
            student_code: record.student_code || '',
            student_email: record.student_email || '',
            program_name: record.program_name || '',
            company_name: record.company_name || '',
            boss_name: record.boss_name || '',
            monitor1_name: record.monitor1_name || '',
            monitor2_name: record.monitor2_name || '',
            date_start: record.date_start_practice ? new Date(record.date_start_practice).toLocaleDateString('es-ES') : '',
            date_end: record.date_end_practice ? new Date(record.date_end_practice).toLocaleDateString('es-ES') : '',
            status: record.med_student_status || '',
            date_send: record.last_date_send_student ? new Date(record.last_date_send_student).toLocaleString('es-ES') : '',
            date_answer: record.last_date_answer_student ? new Date(record.last_date_answer_student).toLocaleString('es-ES') : '',
            question_id: '',
            question: 'SIN RESPUESTAS',
            answer: ''
          });
        }
      }

      // Procesar MONITORES - MOSTRAR TODOS, incluso sin respuestas
      if (record.med_monitor_status || record.monitor1_name) {
        monitorCount++;
        const monitorAnswers = record.med_monitor_data ? parseEvaluationData(record.med_monitor_data, 'monitor') : [];
        
        if (monitorAnswers.length > 0) {
          monitorWithAnswers++;
          // Si hay respuestas, mostrar cada pregunta/respuesta en una fila
          monitorAnswers.forEach((answer, index) => {
            monitorSheet.addRow({
              legalization_id: index === 0 ? legalizationId : '',
              student_name: index === 0 ? (record.student_name || '') : '',
              student_code: index === 0 ? (record.student_code || '') : '',
              program_name: index === 0 ? (record.program_name || '') : '',
              company_name: index === 0 ? (record.company_name || '') : '',
              monitor_name: index === 0 ? (record.monitor1_name || '') : '',
              monitor_email: index === 0 ? (record.monitor1_email || '') : '',
              monitor_type: index === 0 ? 'Monitor Principal' : '',
              date_start: index === 0 ? (record.date_start_practice ? new Date(record.date_start_practice).toLocaleDateString('es-ES') : '') : '',
              date_end: index === 0 ? (record.date_end_practice ? new Date(record.date_end_practice).toLocaleDateString('es-ES') : '') : '',
              status: index === 0 ? (record.med_monitor_status || '') : '',
              date_send: index === 0 ? (record.last_date_send_monitor ? new Date(record.last_date_send_monitor).toLocaleString('es-ES') : '') : '',
              date_answer: index === 0 ? (record.last_date_answer_monitor ? new Date(record.last_date_answer_monitor).toLocaleString('es-ES') : '') : '',
              question_id: answer.question_id,
              question: answer.question,
              answer: answer.answer || (answer.closed_answer || '') + (answer.open_answer ? (answer.closed_answer ? ' - ' : '') + answer.open_answer : '')
            });
          });
        } else {
          // Si NO hay respuestas, mostrar una fila con información básica pero sin preguntas/respuestas
          monitorSheet.addRow({
            legalization_id: legalizationId,
            student_name: record.student_name || '',
            student_code: record.student_code || '',
            program_name: record.program_name || '',
            company_name: record.company_name || '',
            monitor_name: record.monitor1_name || '',
            monitor_email: record.monitor1_email || '',
            monitor_type: 'Monitor Principal',
            date_start: record.date_start_practice ? new Date(record.date_start_practice).toLocaleDateString('es-ES') : '',
            date_end: record.date_end_practice ? new Date(record.date_end_practice).toLocaleDateString('es-ES') : '',
            status: record.med_monitor_status || '',
            date_send: record.last_date_send_monitor ? new Date(record.last_date_send_monitor).toLocaleString('es-ES') : '',
            date_answer: record.last_date_answer_monitor ? new Date(record.last_date_answer_monitor).toLocaleString('es-ES') : '',
            question_id: '',
            question: 'SIN RESPUESTAS',
            answer: ''
          });
        }
      }
    }

    // Aplicar formato a los headers de todas las hojas
    [bossSheet, studentSheet, monitorSheet].forEach(sheet => {
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // 4. Guardar el archivo Excel
    const outputDir = path.join(__dirname, '../../exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generar nombre de archivo único con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const fileName = `evaluacion_${EVALUATION_ID}_${timestamp}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    console.log('✅ Exportación completada exitosamente!\n');
    console.log('📊 Resumen:');
    console.log(`   - Registros totales: ${practiceEvaluations.length}`);
    console.log(`   - Total Jefes: ${bossCount} (con respuestas: ${bossWithAnswers}, sin respuestas: ${bossCount - bossWithAnswers})`);
    console.log(`   - Total Estudiantes: ${studentCount} (con respuestas: ${studentWithAnswers}, sin respuestas: ${studentCount - studentWithAnswers})`);
    console.log(`   - Total Monitores: ${monitorCount} (con respuestas: ${monitorWithAnswers}, sin respuestas: ${monitorCount - monitorWithAnswers})\n`);
    console.log(`📁 Archivo guardado en: ${filePath}\n`);

    return filePath;

  } catch (error) {
    console.error('❌ Error durante la exportación:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Ejecutar el script
exportEvaluationToExcel()
  .then(() => {
    console.log('✅ Script finalizado correctamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
