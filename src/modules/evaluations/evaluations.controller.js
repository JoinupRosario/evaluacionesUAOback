import pool from '../../config/mysql.js';
import mongoose from 'mongoose';
import Evaluation from './models/Evaluation.js';
import PracticeEvaluation from './models/PracticeEvaluation.js';
import Question from './models/Question.js';
import Answer from './models/Answer.js';
import Token from './models/Token.js';
import EvaluationAccessToken from './models/EvaluationAccessToken.js';
import Status from './models/Status.js';
import Student from './models/Student.js';
import Boss from './models/Boss.js';
import Monitor from './models/Monitor.js';
import Survey from '../surveys/models/Survey.js';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { sendEvaluationTestEmail, sendPracticeEvaluationEmail } from '../../config/sendgrid.js';

/**
 * Genera tokens y links únicos para cada actor de la evaluación
 */
const generateEvaluationAccessTokens = async (evaluationMongo, studentsEmails, bossesEmails, monitorsEmails, evaluationType = 'PRACTICE', teachersEmails = null, coordinatorsEmails = null) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.warn('⚠️  MongoDB no está conectado, no se pueden generar tokens');
      return;
    }

    const evaluationId = evaluationMongo._id;
    const med_enc_id_student = evaluationMongo.med_enc_id_student;
    const med_enc_id_boss = evaluationMongo.med_enc_id_boss;
    const med_enc_id_monitor = evaluationMongo.med_enc_id_monitor;
    const med_enc_id_teacher = evaluationMongo.med_enc_id_teacher;
    const med_enc_id_coord = evaluationMongo.med_enc_id_coord;
    const type_survey = evaluationMongo.type_survey;

    // Verificar si el Survey existe en MongoDB antes de generar tokens
    let surveyExists = false;
    if (type_survey) {
      try {
        // Buscar el Survey por survey_id_mysql (que corresponde al type_survey de MySQL)
        const survey = await Survey.findOne({ survey_id_mysql: type_survey });
        if (survey) {
          surveyExists = true;
          console.log(`✅ Survey encontrado en MongoDB (survey_id_mysql: ${type_survey}), se generarán tokens`);
        } else {
          console.warn(`⚠️  Survey no encontrado en MongoDB (survey_id_mysql: ${type_survey}), NO se generarán tokens`);
        }
      } catch (error) {
        console.error('Error al verificar existencia del Survey:', error);
      }
    }

    // Si el Survey no existe en MongoDB, no generar tokens
    if (!surveyExists) {
      console.warn('⚠️  No se generarán tokens porque el Survey no existe en MongoDB');
      return 0;
    }

    // URL base del frontend (debería venir de una variable de entorno)
    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Fecha de expiración: 90 días desde ahora
    const expiraEn = new Date();
    expiraEn.setDate(expiraEn.getDate() + 90);

    let tokensGenerados = 0;

    // Generar tokens para estudiantes usando bulk operations
    if (med_enc_id_student && studentsEmails && studentsEmails.length > 0) {
      // Obtener todos los tokens existentes de una vez
      const existingTokens = await EvaluationAccessToken.find({
        evaluation_id: evaluationId,
        actor_type: 'student',
        legalization_id: { $in: studentsEmails.map(s => s.legalization_id) }
      }).lean();

      const existingTokensMap = new Map();
      existingTokens.forEach(token => {
        existingTokensMap.set(`${token.legalization_id}`, token);
      });

      const bulkOps = [];
      const updateOps = [];

      for (const studentEmail of studentsEmails) {
        const existingToken = existingTokensMap.get(`${studentEmail.legalization_id}`);

        if (!existingToken) {
          // Crear nuevo token
          const token = crypto.randomBytes(32).toString('hex');
          const link = `${frontendBaseUrl}/responder-evaluacion/${token}`;

          bulkOps.push({
            insertOne: {
              document: {
                evaluation_id: evaluationId,
                legalization_id: studentEmail.legalization_id,
                actor_type: 'student',
                email: studentEmail.email,
                med_enc_id: med_enc_id_student,
                token,
                link,
                expira_en: expiraEn,
                usado: false
              }
            }
          });
          tokensGenerados++;
        } else if (!existingToken.usado) {
          // Solo actualizar si no está usado (no regenerar tokens usados)
          updateOps.push({
            updateOne: {
              filter: { _id: existingToken._id },
              update: {
                $set: {
                  email: studentEmail.email,
                  med_enc_id: med_enc_id_student
                }
              }
            }
          });
        }
      }

      // Ejecutar operaciones en lote
      if (bulkOps.length > 0) {
        await EvaluationAccessToken.bulkWrite(bulkOps);
      }
      if (updateOps.length > 0) {
        await EvaluationAccessToken.bulkWrite(updateOps);
      }
    }

    // Generar tokens para jefes usando bulk operations
    if (med_enc_id_boss && bossesEmails && bossesEmails.length > 0) {
      // Obtener todos los tokens existentes de una vez
      const existingTokens = await EvaluationAccessToken.find({
        evaluation_id: evaluationId,
        actor_type: 'boss',
        legalization_id: { $in: bossesEmails.map(b => b.legalization_id) }
      }).lean();

      const existingTokensMap = new Map();
      existingTokens.forEach(token => {
        existingTokensMap.set(`${token.legalization_id}`, token);
      });

      const bulkOps = [];
      const updateOps = [];

      for (const bossEmail of bossesEmails) {
        const existingToken = existingTokensMap.get(`${bossEmail.legalization_id}`);

        if (!existingToken) {
          // Crear nuevo token
          const token = crypto.randomBytes(32).toString('hex');
          const link = `${frontendBaseUrl}/responder-evaluacion/${token}`;

          bulkOps.push({
            insertOne: {
              document: {
                evaluation_id: evaluationId,
                legalization_id: bossEmail.legalization_id,
                actor_type: 'boss',
                email: bossEmail.email,
                med_enc_id: med_enc_id_boss,
                token,
                link,
                expira_en: expiraEn,
                usado: false
              }
            }
          });
          tokensGenerados++;
        } else if (!existingToken.usado) {
          // Solo actualizar si no está usado (no regenerar tokens usados)
          updateOps.push({
            updateOne: {
              filter: { _id: existingToken._id },
              update: {
                $set: {
                  email: bossEmail.email,
                  med_enc_id: med_enc_id_boss
                }
              }
            }
          });
        }
      }

      // Ejecutar operaciones en lote
      if (bulkOps.length > 0) {
        await EvaluationAccessToken.bulkWrite(bulkOps);
      }
      if (updateOps.length > 0) {
        await EvaluationAccessToken.bulkWrite(updateOps);
      }
    }

    // Generar tokens para monitores usando bulk operations
    if (med_enc_id_monitor && monitorsEmails && monitorsEmails.length > 0) {
      // Obtener todos los tokens existentes de una vez
      const existingTokens = await EvaluationAccessToken.find({
        evaluation_id: evaluationId,
        actor_type: 'monitor',
        legalization_id: { $in: monitorsEmails.map(m => m.legalization_id) }
      }).lean();

      const existingTokensMap = new Map();
      existingTokens.forEach(token => {
        const key = `${token.legalization_id}_${token.monitor_type || ''}`;
        existingTokensMap.set(key, token);
      });

      const bulkOps = [];
      const updateOps = [];

      for (const monitorEmail of monitorsEmails) {
        const key = `${monitorEmail.legalization_id}_${monitorEmail.monitor_type || ''}`;
        const existingToken = existingTokensMap.get(key);

        if (!existingToken) {
          // Crear nuevo token
          const token = crypto.randomBytes(32).toString('hex');
          const link = `${frontendBaseUrl}/responder-evaluacion/${token}`;

          bulkOps.push({
            insertOne: {
              document: {
                evaluation_id: evaluationId,
                legalization_id: monitorEmail.legalization_id,
                actor_type: 'monitor',
                email: monitorEmail.email,
                med_enc_id: med_enc_id_monitor,
                monitor_type: monitorEmail.monitor_type,
                token,
                link,
                expira_en: expiraEn,
                usado: false
              }
            }
          });
          tokensGenerados++;
        } else if (!existingToken.usado) {
          // Solo actualizar si no está usado (no regenerar tokens usados)
          updateOps.push({
            updateOne: {
              filter: { _id: existingToken._id },
              update: {
                $set: {
                  email: monitorEmail.email,
                  med_enc_id: med_enc_id_monitor
                }
              }
            }
          });
        }
      }

      // Ejecutar operaciones en lote
      if (bulkOps.length > 0) {
        await EvaluationAccessToken.bulkWrite(bulkOps);
      }
      if (updateOps.length > 0) {
        await EvaluationAccessToken.bulkWrite(updateOps);
      }
    }

    // Si es evaluación de monitoría, generar tokens para teachers y coordinators
    if (evaluationType === 'MONITORING') {
      // Generar tokens para teachers usando bulk operations
      if (med_enc_id_teacher && teachersEmails && teachersEmails.length > 0) {
        // Obtener todos los tokens existentes de una vez
        const existingTokens = await EvaluationAccessToken.find({
          evaluation_id: evaluationId,
          actor_type: 'teacher',
          legalization_id: { $in: teachersEmails.map(t => t.legalization_id) }
        }).lean();

        const existingTokensMap = new Map();
        existingTokens.forEach(token => {
          existingTokensMap.set(`${token.legalization_id}`, token);
        });

        const bulkOps = [];
        const updateOps = [];

        for (const teacherEmail of teachersEmails) {
          const existingToken = existingTokensMap.get(`${teacherEmail.legalization_id}`);

          if (!existingToken) {
            // Crear nuevo token
            const token = crypto.randomBytes(32).toString('hex');
            const link = `${frontendBaseUrl}/responder-evaluacion/${token}`;

            bulkOps.push({
              insertOne: {
                document: {
                  evaluation_id: evaluationId,
                  legalization_id: teacherEmail.legalization_id,
                  actor_type: 'teacher',
                  email: teacherEmail.email,
                  med_enc_id: med_enc_id_teacher,
                  token,
                  link,
                  expira_en: expiraEn,
                  usado: false
                }
              }
            });
            tokensGenerados++;
          } else if (!existingToken.usado) {
            // Solo actualizar si no está usado (no regenerar tokens usados)
            updateOps.push({
              updateOne: {
                filter: { _id: existingToken._id },
                update: {
                  $set: {
                    email: teacherEmail.email,
                    med_enc_id: med_enc_id_teacher
                  }
                }
              }
            });
          }
        }

        // Ejecutar operaciones en lote
        if (bulkOps.length > 0) {
          await EvaluationAccessToken.bulkWrite(bulkOps);
        }
        if (updateOps.length > 0) {
          await EvaluationAccessToken.bulkWrite(updateOps);
        }
      }

      // Generar tokens para coordinators usando bulk operations
      if (med_enc_id_coord && coordinatorsEmails && coordinatorsEmails.length > 0) {
        // Obtener todos los tokens existentes de una vez
        const existingTokens = await EvaluationAccessToken.find({
          evaluation_id: evaluationId,
          actor_type: 'coordinator',
          legalization_id: { $in: coordinatorsEmails.map(c => c.legalization_id) }
        }).lean();

        const existingTokensMap = new Map();
        existingTokens.forEach(token => {
          existingTokensMap.set(`${token.legalization_id}`, token);
        });

        const bulkOps = [];
        const updateOps = [];

        for (const coordinatorEmail of coordinatorsEmails) {
          const existingToken = existingTokensMap.get(`${coordinatorEmail.legalization_id}`);

          if (!existingToken) {
            // Crear nuevo token
            const token = crypto.randomBytes(32).toString('hex');
            const link = `${frontendBaseUrl}/responder-evaluacion/${token}`;

            bulkOps.push({
              insertOne: {
                document: {
                  evaluation_id: evaluationId,
                  legalization_id: coordinatorEmail.legalization_id,
                  actor_type: 'coordinator',
                  email: coordinatorEmail.email,
                  med_enc_id: med_enc_id_coord,
                  token,
                  link,
                  expira_en: expiraEn,
                  usado: false
                }
              }
            });
            tokensGenerados++;
          } else if (!existingToken.usado) {
            // Solo actualizar si no está usado (no regenerar tokens usados)
            updateOps.push({
              updateOne: {
                filter: { _id: existingToken._id },
                update: {
                  $set: {
                    email: coordinatorEmail.email,
                    med_enc_id: med_enc_id_coord
                  }
                }
              }
            });
          }
        }

        // Ejecutar operaciones en lote
        if (bulkOps.length > 0) {
          await EvaluationAccessToken.bulkWrite(bulkOps);
        }
        if (updateOps.length > 0) {
          await EvaluationAccessToken.bulkWrite(updateOps);
        }
      }
    }

    return tokensGenerados;
  } catch (error) {
    console.error('Error al generar tokens de acceso:', error);
    throw error;
  }
};

/**
 * Calcula y actualiza los porcentajes de participación de cada actor para evaluaciones de monitoría
 * basándose en las respuestas guardadas en PracticeEvaluation
 */
const calculateMonitoringEvaluationPercentages = async (evaluation_id) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: evaluation_id });
    if (!evaluationMongo) {
      return;
    }

    const evaluationMongoId = evaluationMongo._id;
    const total_students = evaluationMongo.total_students || 0;
    const total_teachers = evaluationMongo.total_teachers || 0;
    const total_coordinators = evaluationMongo.total_coordinators || 0;

    // Contar respuestas de estudiantes (med_student_status = 'COMPLETED')
    const studentsAnswered = await PracticeEvaluation.countDocuments({
      evaluation_id: evaluationMongoId,
      med_student_status: 'COMPLETED'
    });

    // Contar respuestas de teachers (med_boss_status = 'COMPLETED' para monitorías)
    const teachersAnswered = await PracticeEvaluation.countDocuments({
      evaluation_id: evaluationMongoId,
      med_boss_status: 'COMPLETED'
    });

    // Contar respuestas de coordinadores (med_monitor_status = 'COMPLETED' para monitorías)
    const coordinatorsAnswered = await PracticeEvaluation.countDocuments({
      evaluation_id: evaluationMongoId,
      med_monitor_status: 'COMPLETED'
    });

    // Calcular porcentajes (redondear a entero)
    const percentage_students = total_students > 0 
      ? Math.round((studentsAnswered / total_students) * 100) 
      : 0;
    const percentage_teachers = total_teachers > 0 
      ? Math.round((teachersAnswered / total_teachers) * 100) 
      : 0;
    const percentage_coords = total_coordinators > 0 
      ? Math.round((coordinatorsAnswered / total_coordinators) * 100) 
      : 0;

    // Actualizar en MySQL
    await pool.query(`
      UPDATE monitoring_evaluation
      SET percentage_students = ?,
          percentage_teachers = ?,
          percentage_coords = ?
      WHERE evaluation_id = ?
    `, [percentage_students, percentage_teachers, percentage_coords, evaluation_id]);

    // Actualizar en MongoDB
    evaluationMongo.percentage_students = percentage_students;
    evaluationMongo.percentage_teachers = percentage_teachers;
    evaluationMongo.percentage_coords = percentage_coords;
    await evaluationMongo.save();

    return {
      percentage_students,
      percentage_teachers,
      percentage_coords,
      studentsAnswered,
      teachersAnswered,
      coordinatorsAnswered
    };
  } catch (error) {
    console.error('Error al calcular porcentajes de evaluación de monitoría:', error);
    throw error;
  }
};

/**
 * Calcula y actualiza los porcentajes de participación de cada actor
 * basándose en las respuestas guardadas en PracticeEvaluation
 */
const calculateEvaluationPercentages = async (evaluation_id) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    // Buscar la evaluación en MongoDB para obtener el evaluation_id de MongoDB
    const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: evaluation_id });
    if (!evaluationMongo) {
      return;
    }

    const evaluationMongoId = evaluationMongo._id;
    const total_students = evaluationMongo.total_students || 0;
    const total_bosses = evaluationMongo.total_bosses || 0;
    const total_monitors = evaluationMongo.total_monitors || 0;

    // Contar respuestas de estudiantes (med_student_status = 'COMPLETED')
    const studentsAnswered = await PracticeEvaluation.countDocuments({
      evaluation_id: evaluationMongoId,
      med_student_status: 'COMPLETED'
    });

    // Contar respuestas de jefes (med_boss_status = 'COMPLETED')
    const bossesAnswered = await PracticeEvaluation.countDocuments({
      evaluation_id: evaluationMongoId,
      med_boss_status: 'COMPLETED'
    });

    // Contar respuestas de monitores (med_monitor_status = 'COMPLETED')
    const monitorsAnswered = await PracticeEvaluation.countDocuments({
      evaluation_id: evaluationMongoId,
      med_monitor_status: 'COMPLETED'
    });

    // Calcular porcentajes (redondear a entero)
    const percentage_students = total_students > 0 
      ? Math.round((studentsAnswered / total_students) * 100) 
      : 0;
    const percentage_bosses = total_bosses > 0 
      ? Math.round((bossesAnswered / total_bosses) * 100) 
      : 0;
    const percentage_monitors = total_monitors > 0 
      ? Math.round((monitorsAnswered / total_monitors) * 100) 
      : 0;

    // Actualizar en MySQL
    // COMENTADO: percentage_monitors no existe en esta BD según uao.sql
    await pool.query(`
      UPDATE evaluations
      SET percentage_students = ?,
          percentage_bosses = ?
      WHERE evaluation_id = ?
    `, [percentage_students, percentage_bosses, evaluation_id]);

    // Actualizar en MongoDB
    evaluationMongo.percentage_students = percentage_students;
    evaluationMongo.percentage_bosses = percentage_bosses;
    evaluationMongo.percentage_monitors = percentage_monitors;
    await evaluationMongo.save();

    return {
      percentage_students,
      percentage_bosses,
      percentage_monitors,
      studentsAnswered,
      bossesAnswered,
      monitorsAnswered
    };
  } catch (error) {
    console.error('Error al calcular porcentajes de evaluación:', error);
    throw error;
  }
};

/**
 * Calcula los totales de estudiantes, jefes y monitores para una evaluación
 * basándose en las legalizaciones de prácticas que cumplen los criterios
 */
const calculateEvaluationTotals = async (evaluation_id, evaluationData) => {
  try {
    const {
      period,
      practice_type,
      // COMENTADO: faculty_id eliminado - ya no se usa
      start_date,
      finish_date,
      alert_value,
      alert_unit,
      alert_when
    } = evaluationData;

    // Construir condiciones base
    let whereConditions = ['apl.academic_period_apl = ?'];
    let queryParams = [period];

    // Filtro por tipo de práctica
    // CORREGIDO: Según uao.sql y los logs, debemos usar practice_type (NO practice_type_authorization)
    // El campo practice_type en evaluations corresponde a practice_type en academic_practice_legalized
    if (practice_type) {
      whereConditions.push('apl.practice_type = ?');
      queryParams.push(practice_type);
    }

    // COMENTADO: faculty_apl no existe en academic_practice_legalized según uao.sql
    // Filtro por facultad - ELIMINADO porque no existe la columna

    // Filtro por programas asociados a la evaluación
    // COMENTADO: evaluation_program tiene program_id que apunta directamente a program.id
    // y academic_practice_legalized tiene program_apl que también apunta a program.id
    const [programsCheck] = await pool.query(
      'SELECT COUNT(*) as count FROM evaluation_program WHERE evaluation_id = ?',
      [evaluation_id]
    );
    
    if (programsCheck[0].count > 0) {
      whereConditions.push(`
        EXISTS (
          SELECT 1 
          FROM evaluation_program ep
          WHERE ep.evaluation_id = ?
            AND ep.program_id = apl.program_apl
        )
      `);
      queryParams.push(evaluation_id);
    }

    // Filtrar por estados válidos - excluir estados cancelados y rechazados
    // NOTA: Se excluyen CTP_CANCEL, CANCELLED, DELETED, CTP_REJECTED
    // Se incluyen: CTP_APPROVAL, FINISHED, POSTULANT_REVIEW y otros válidos
    const estadosExcluidos = ['CTP_CANCEL', 'CANCELLED', 'DELETED', 'CTP_REJECTED'];
    whereConditions.push(`apl.status_apl NOT IN ('${estadosExcluidos.join("', '")}')`);

    const whereClause = whereConditions.join(' AND ');

    // Query para contar estudiantes (DISTINCT postulant_apl)
    const studentsQuery = `
      SELECT COUNT(DISTINCT apl.postulant_apl) as total
      FROM academic_practice_legalized apl
      WHERE ${whereClause}
    `;
    const [studentsResult] = await pool.query(studentsQuery, queryParams);
    const total_students = studentsResult[0]?.total || 0;

    // Query para contar jefes (DISTINCT boss_apl, excluyendo NULL)
    const bossesQuery = `
      SELECT COUNT(DISTINCT apl.boss_apl) as total
      FROM academic_practice_legalized apl
      WHERE ${whereClause}
        AND apl.boss_apl IS NOT NULL
    `;
    const [bossesResult] = await pool.query(bossesQuery, queryParams);
    const total_bosses = bossesResult[0]?.total || 0;

    // Query para contar monitores
    // COMENTADO: user_tutor y user_tutor_2 no existen en academic_practice_legalized según uao.sql
    // La tabla tiene 'teacher' que apunta a user.id, pero no hay columnas específicas para monitores
    // Por ahora, no se cuentan monitores ya que no hay columnas para ellos
    const total_monitors = 0; // Valor por defecto ya que no hay columnas de monitores en esta BD

    // Obtener correos de estudiantes con sus IDs de legalización
    // postulant_apl -> postulant.postulant_id -> user.id
    // Intentar primero user.personal_email, si no está usar postulant.alternate_email
    const [studentsEmails] = await pool.query(`
      SELECT 
        apl.academic_practice_legalized_id as legalization_id,
        COALESCE(NULLIF(u.personal_email, ''), p.alternate_email) as email
      FROM academic_practice_legalized apl
      INNER JOIN postulant p ON apl.postulant_apl = p.postulant_id
      INNER JOIN user u ON p.postulant_id = u.id
      WHERE ${whereClause}
        AND (
          (u.personal_email IS NOT NULL AND u.personal_email != '')
          OR (p.alternate_email IS NOT NULL AND p.alternate_email != '')
        )
    `, queryParams);

    // Obtener correos de jefes con sus IDs de legalización
    const [bossesEmails] = await pool.query(`
      SELECT 
        apl.academic_practice_legalized_id as legalization_id,
        pb.email
      FROM academic_practice_legalized apl
      INNER JOIN practice_boss pb ON apl.boss_apl = pb.boss_id
      WHERE ${whereClause}
        AND apl.boss_apl IS NOT NULL
        AND pb.email IS NOT NULL
        AND pb.email != ''
    `, queryParams);

    // Obtener correos de monitores
    // COMENTADO: user_tutor y user_tutor_2 no existen en academic_practice_legalized según uao.sql
    // La tabla tiene 'teacher' que apunta a user.id, pero no hay columnas específicas para monitores/tutores
    // Por ahora, no se obtienen correos de monitores ya que no hay columnas para ellos
    const monitorsEmails = []; // Array vacío ya que no hay columnas de monitores en esta BD

    // Actualizar los totales en la evaluación
    // COMENTADO: total_monitors no existe en esta BD según uao.sql
    await pool.query(`
      UPDATE evaluations
      SET total_students = ?,
          total_bosses = ?
      WHERE evaluation_id = ?
    `, [total_students, total_bosses, evaluation_id]);

    // Actualizar en MongoDB con totales y correos
    if (mongoose.connection.readyState === 1) {
      // Recargar la evaluación de MongoDB para asegurar que tenemos los valores más recientes (med_enc_id_*)
      const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: evaluation_id });
      if (evaluationMongo) {

        evaluationMongo.total_students = total_students;
        evaluationMongo.total_bosses = total_bosses;
        evaluationMongo.total_monitors = total_monitors;
        
        // Guardar correos de estudiantes
        evaluationMongo.student_emails = studentsEmails.map(row => ({
          legalization_id: row.legalization_id,
          email: row.email
        }));
        
        // Guardar correos de jefes
        evaluationMongo.boss_emails = bossesEmails.map(row => ({
          legalization_id: row.legalization_id,
          email: row.email
        }));
        
        // Guardar correos de monitores
        evaluationMongo.monitor_emails = monitorsEmails.map(row => ({
          legalization_id: row.legalization_id,
          email: row.email,
          monitor_type: row.monitor_type
        }));
        
        await evaluationMongo.save();

        // Recargar la evaluación después de guardar para asegurar que tenemos los valores más recientes
        const evaluationMongoReloaded = await Evaluation.findOne({ evaluation_id_mysql: evaluation_id });

        // Generar tokens y links únicos para cada actor
        try {
          await generateEvaluationAccessTokens(
            evaluationMongoReloaded || evaluationMongo,
            studentsEmails,
            bossesEmails,
            monitorsEmails
          );
        } catch (tokenError) {
          console.error('⚠️  Error al generar tokens (no crítico):', tokenError);
          // No fallar el proceso si la generación de tokens falla
        }
      } else {
        console.warn('⚠️  No se encontró la evaluación en MongoDB para generar tokens');
      }
    }

    return {
      total_students,
      total_bosses,
      total_monitors
    };
  } catch (error) {
    console.error('Error al calcular totales de evaluación:', error);
    throw error;
  }
};

/**
 * Calcula los totales de teachers, students y coordinators para una evaluación de monitoría
 * basándose en las legalizaciones de monitoría que cumplen los criterios
 */
const calculateMonitoringEvaluationTotals = async (evaluation_id, evaluationData) => {
  try {
    const {
      period,
      categories,
      faculty_id
    } = evaluationData;

    // Construir condiciones base
    let whereConditions = ['ml.period_ml = ?'];
    let queryParams = [period];

    // Filtro por categorías
    const [categoriesCheck] = await pool.query(
      'SELECT category FROM monitoring_evaluation_category WHERE evaluation_id = ?',
      [evaluation_id]
    );
    
    if (categoriesCheck.length > 0) {
      const categoryIds = categoriesCheck.map(row => row.category);
      const placeholders = categoryIds.map(() => '?').join(',');
      whereConditions.push(`ml.category IN (${placeholders})`);
      queryParams.push(...categoryIds);
    }

    // Filtro por facultad (si existe)
    if (faculty_id) {
      whereConditions.push('ml.faculty_ml = ?');
      queryParams.push(faculty_id);
    }

    // Filtrar por estados válidos - excluir estados cancelados y otros estados no válidos
    // El sistema anterior excluía: CANCELLED, DELETED, CANCELED, CREATED, REVIEWING
    whereConditions.push(`ml.status NOT IN ('CANCELLED', 'DELETED', 'CANCELED', 'CREATED', 'REVIEWING')`);

    const whereClause = whereConditions.join(' AND ');

    // DEBUG: Mostrar la query construida (solo en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      console.log('\n🔍 [DEBUG] Parámetros de la evaluación:');
      console.log(`   - Period: ${period}`);
      console.log(`   - Categories: ${categoriesCheck.length > 0 ? categoriesCheck.map(r => r.category).join(', ') : 'NINGUNA'}`);
      console.log(`   - Faculty ID: ${faculty_id || 'NINGUNA'}`);
    }

    // Obtener correos de estudiantes con sus IDs de legalización
    // postulant_ml -> postulant.postulant_id -> user.id
    const studentsQuery = `
      SELECT 
        ml.monitoring_legalized_id as legalization_id,
        COALESCE(NULLIF(u.personal_email, ''), p.alternate_email) as email
      FROM monitoring_legalized ml
      INNER JOIN postulant p ON ml.postulant_ml = p.postulant_id
      INNER JOIN user u ON p.postulant_id = u.id
      WHERE ${whereClause}
        AND (
          (u.personal_email IS NOT NULL AND u.personal_email != '')
          OR (p.alternate_email IS NOT NULL AND p.alternate_email != '')
        )
    `;
    const [studentsEmails] = await pool.query(studentsQuery, queryParams);
    if (process.env.NODE_ENV === 'development') {
      console.log(`   ✅ Estudiantes: ${studentsEmails.length}`);
    }

    // Obtener correos de teachers con sus IDs de legalización
    let teachersEmails = [];
    
    // Intentar obtener por user_teacher
    const teachersQueryByUser = `
      SELECT 
        ml.monitoring_legalized_id as legalization_id,
        COALESCE(NULLIF(u.personal_email, ''), u.user_name) as email
      FROM monitoring_legalized ml
      INNER JOIN user u ON ml.user_teacher = u.id
      WHERE ${whereClause}
        AND ml.user_teacher IS NOT NULL
        AND (
          (u.personal_email IS NOT NULL AND u.personal_email != '')
          OR (u.user_name IS NOT NULL AND u.user_name != '')
        )
    `;
    const [teachersEmailsByUser] = await pool.query(teachersQueryByUser, queryParams);
    if (process.env.NODE_ENV === 'development') {
      console.log(`   ✅ Teachers (user_teacher): ${teachersEmailsByUser.length}`);
    }
    
    if (teachersEmailsByUser.length > 0) {
      teachersEmails = teachersEmailsByUser;
    } else {
      // Si no hay por user_teacher, usar mail_responsable o buscar por responsable en user
      const teachersQueryByResponsable = `
        SELECT DISTINCT
          ml.monitoring_legalized_id as legalization_id,
          COALESCE(
            NULLIF(ml.mail_responsable, ''),
            COALESCE(
              NULLIF(u.personal_email, ''),
              u.user_name
            ),
            CONCAT(ml.responsable, '@temp.com')
          ) as email
        FROM monitoring_legalized ml
        LEFT JOIN user u ON (
          CONCAT(u.name, ' ', u.last_name) = ml.responsable
          OR u.personal_email = ml.mail_responsable
          OR u.user_name = ml.mail_responsable
        )
        WHERE ${whereClause}
          AND (
            (ml.mail_responsable IS NOT NULL AND ml.mail_responsable != '')
            OR (ml.responsable IS NOT NULL AND ml.responsable != '')
          )
      `;
      const [teachersEmailsByResponsable] = await pool.query(teachersQueryByResponsable, queryParams);
      if (process.env.NODE_ENV === 'development') {
        console.log(`   ✅ Teachers (responsable): ${teachersEmailsByResponsable.length}`);
      }
      teachersEmails = teachersEmailsByResponsable;
    }

    // Obtener correos de coordinadores con sus IDs de legalización
    // user_coordinator apunta directamente a user.id
    const coordinatorsQuery = `
      SELECT 
        ml.monitoring_legalized_id as legalization_id,
        COALESCE(NULLIF(u.personal_email, ''), u.user_name) as email
      FROM monitoring_legalized ml
      INNER JOIN user u ON ml.user_coordinator = u.id
      WHERE ${whereClause}
        AND ml.user_coordinator IS NOT NULL
        AND (
          (u.personal_email IS NOT NULL AND u.personal_email != '')
          OR (u.user_name IS NOT NULL AND u.user_name != '')
        )
    `;
    const [coordinatorsEmails] = await pool.query(coordinatorsQuery, queryParams);
    if (process.env.NODE_ENV === 'development') {
      console.log(`   ✅ Coordinadores: ${coordinatorsEmails.length}`);
    }

    // Contar el número de correos obtenidos (esto es lo que se usará para generar tokens)
    // Un estudiante/responsable/coordinador puede tener múltiples legalizaciones, cada una genera un token
    const total_students = studentsEmails.length;
    
    // Para teachers, el sistema anterior contaba TODAS las legalizaciones (sin DISTINCT)
    // que tienen mail_responsable, no usaba responsable como fallback
    let total_teachers = 0;
    if (teachersEmailsByUser.length > 0) {
      // Si tenemos user_teacher, contar todas las legalizaciones (sin DISTINCT)
      const [teachersCountByID] = await pool.query(`
        SELECT COUNT(*) as total
        FROM monitoring_legalized ml
        INNER JOIN user u ON ml.user_teacher = u.id
        WHERE ${whereClause}
          AND ml.user_teacher IS NOT NULL
          AND (
            (u.personal_email IS NOT NULL AND u.personal_email != '')
            OR (u.user_name IS NOT NULL AND u.user_name != '')
          )
      `, queryParams);
      total_teachers = teachersCountByID[0]?.total || 0;
    } else {
      // Si no hay user_teacher, contar TODAS las legalizaciones que tienen mail_responsable
      // (sin DISTINCT, sin usar responsable como fallback - como hacía el sistema anterior)
      const [teachersCountDirect] = await pool.query(`
        SELECT COUNT(*) as total
        FROM monitoring_legalized ml
        WHERE ${whereClause}
          AND ml.mail_responsable IS NOT NULL
          AND ml.mail_responsable != ''
      `, queryParams);
      total_teachers = teachersCountDirect[0]?.total || 0;
    }
    
    const total_coordinators = coordinatorsEmails.length;

    // Actualizar los totales en la evaluación
    await pool.query(`
      UPDATE monitoring_evaluation
      SET total_teachers = ?,
          total_students = ?,
          total_coordinators = ?
      WHERE evaluation_id = ?
    `, [total_teachers, total_students, total_coordinators, evaluation_id]);

    // Actualizar en MongoDB con totales y correos
    if (mongoose.connection.readyState === 1) {
      const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: evaluation_id });
      if (evaluationMongo) {
        evaluationMongo.total_teachers = total_teachers;
        evaluationMongo.total_students = total_students;
        evaluationMongo.total_coordinators = total_coordinators;
        
        // Usar updateOne en lugar de save para mejor performance
        await Evaluation.updateOne(
          { _id: evaluationMongo._id },
          {
            $set: {
              evaluation_type: 'MONITORING', // Asegurar que siempre sea MONITORING
              total_teachers,
              total_students,
              total_coordinators,
              student_emails: studentsEmails.map(row => ({
                legalization_id: row.legalization_id,
                email: row.email
              })),
              teacher_emails: teachersEmails.map(row => ({
                legalization_id: row.legalization_id,
                email: row.email
              })),
              coordinator_emails: coordinatorsEmails.map(row => ({
                legalization_id: row.legalization_id,
                email: row.email
              }))
            }
          }
        );

        // Generar tokens y links únicos para cada actor de monitoría
        try {
          await generateEvaluationAccessTokens(
            evaluationMongo,
            studentsEmails,
            null, // bossesEmails (no aplica para monitorías)
            null, // monitorsEmails (no aplica para monitorías)
            'MONITORING',
            teachersEmails,
            coordinatorsEmails
          );
          console.log(`\n✅ Tokens generados exitosamente para evaluación de monitoría`);
        } catch (tokenError) {
          console.error('⚠️  Error al generar tokens (no crítico):', tokenError);
        }
      } else {
        console.warn('⚠️  No se encontró la evaluación en MongoDB para generar tokens');
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`\n📊 [DEBUG] RESULTADOS FINALES:`);
      console.log(`   - Total Teachers: ${total_teachers}`);
      console.log(`   - Total Students: ${total_students}`);
      console.log(`   - Total Coordinators: ${total_coordinators}`);
    }

    return {
      total_teachers,
      total_students,
      total_coordinators
    };
  } catch (error) {
    console.error('❌ [ERROR] Error al calcular totales de evaluación de monitoría:', error);
    console.error('❌ [ERROR] Stack:', error.stack);
    throw error;
  }
};

export const createEvaluation = async (req, res) => {
  try {
    const {
      name,
      period,
      practice_type,
      // COMENTADO: faculty_id eliminado - ya no se usa
      program_faculty_ids,
      type_survey, // ID numérico de la tabla item (MySQL)
      start_date,
      finish_date,
      alert_value,
      alert_unit,
      alert_when
    } = req.body;

    // Validaciones básicas
    if (!name || !period || !start_date || !finish_date || !type_survey) {
      return res.status(400).json({ error: 'Campos requeridos: name, period, start_date, finish_date, type_survey' });
    }

    const user_creator = req.user?.email || req.user?.username || 'system';

    // Validar y mapear alert_when a los valores correctos de SQL
    let alert_when_value = null;
    if (alert_when) {
      // Mapear valores del frontend a los valores de SQL
      if (alert_when === 'después de iniciar' || alert_when === 'AFTER_START_PRACTICE') {
        alert_when_value = 'AFTER_START_PRACTICE';
      } else if (alert_when === 'antes de finalizar' || alert_when === 'BEFORE_END_PRACTICE') {
        alert_when_value = 'BEFORE_END_PRACTICE';
      } else {
        // Si viene otro valor, truncar a 25 caracteres
        alert_when_value = alert_when.substring(0, 25);
      }
    }

    // PASO 0: Obtener los med_enc_id_* del value_for_reports del type_survey
    let med_enc_id_student = null;
    let med_enc_id_boss = null;
    let med_enc_id_monitor = null;

    if (type_survey) {
      try {
        const [items] = await pool.query(
          'SELECT value_for_reports FROM item WHERE id = ?',
          [type_survey]
        );
        
        if (items.length > 0 && items[0].value_for_reports) {
          const valueForReports = items[0].value_for_reports;
          // Parsear formato: e:ID_ESTUDIANTE;t:ID_TUTOR;m:ID_MONITOR
          // o formato: e:ID_ESTUDIANTE;t:ID_TUTOR;m:ID_MONITOR
          const parts = valueForReports.split(';');
          for (const part of parts) {
            const [key, value] = part.split(':');
            const id = parseInt(value);
            if (key === 'e' && !isNaN(id)) {
              med_enc_id_student = id !== 0 ? id : null;
            } else if (key === 't' && !isNaN(id)) {
              med_enc_id_boss = id !== 0 ? id : null;
            } else if (key === 'm' && !isNaN(id)) {
              med_enc_id_monitor = id !== 0 ? id : null;
            }
          }
          console.log('📋 IDs de encuestas extraídos:', {
            med_enc_id_student,
            med_enc_id_boss,
            med_enc_id_monitor
          });
        }
      } catch (error) {
        console.warn('⚠️  Error al obtener value_for_reports del type_survey:', error);
      }
    }

    // PASO 1: Insertar en la tabla evaluations (MySQL)
    // COMENTADO: faculty_id, total_monitors y percentage_monitors no existen en esta BD según uao.sql
    const [result] = await pool.query(`
      INSERT INTO evaluations (
        name, period, type_survey, practice_type,
        start_date, finish_date, alert_value, alert_unit, alert_when,
        status, user_creator,
        med_enc_id_student, med_enc_id_boss, med_enc_id_monitor,
        total_bosses, total_students,
        percentage_bosses, percentage_students
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      period,
      type_survey,
      (practice_type && practice_type !== '' && practice_type !== '0') ? parseInt(practice_type) : null,
      start_date,
      finish_date,
      alert_value || 0,
      alert_unit || null,
      alert_when_value,
      'CREATED', // Status inicial en MySQL
      user_creator,
      med_enc_id_student,
      med_enc_id_boss,
      med_enc_id_monitor,
      0, // total_bosses
      0, // total_students
      0, // percentage_bosses
      0  // percentage_students
    ]);

    const evaluation_id = result.insertId;

    // PASO 2: Insertar programas asociados en evaluation_program (MySQL)
    // COMENTADO: evaluation_program tiene program_id, no program_faculty_id según uao.sql
    if (program_faculty_ids && program_faculty_ids.length > 0) {
      const programValues = program_faculty_ids.map(program_id => [evaluation_id, program_id]);
      await pool.query(`
        INSERT INTO evaluation_program (evaluation_id, program_id)
        VALUES ?
      `, [programValues]);
    }

    // PASO 3: Guardar también en MongoDB
    // Nota: type_survey en MongoDB puede ser null o un ObjectId de Survey, pero aquí recibimos un ID numérico de MySQL
    // Por ahora guardamos null en MongoDB para type_survey ya que viene de MySQL
    const evaluationMongo = new Evaluation({
      evaluation_id_mysql: evaluation_id, // Guardar referencia al ID de MySQL
      name,
      period,
      practice_type: practice_type || null,
      // COMENTADO: faculty_id eliminado - ya no se usa
      program_faculty_ids: program_faculty_ids || [],
      type_survey: type_survey ? parseInt(type_survey) : null, // Guardar el ID numérico de MySQL (item.id)
      med_enc_id_student: med_enc_id_student || null,
      med_enc_id_boss: med_enc_id_boss || null,
      med_enc_id_monitor: med_enc_id_monitor || null,
      start_date: new Date(start_date),
      finish_date: new Date(finish_date),
      alert_value: alert_value || 0,
      alert_unit: alert_unit || null,
      alert_when: alert_when || null,
      status: 'CREATED',
      user_creator,
      // Campos inicializados en 0
      total_bosses: 0,
      total_students: 0,
      total_monitors: 0,
      percentage_bosses: 0,
      percentage_students: 0,
      percentage_monitors: 0
    });

    await evaluationMongo.save();

    // PASO 4: Calcular totales de estudiantes, jefes y monitores
    try {
      const totals = await calculateEvaluationTotals(evaluation_id, {
        period,
        practice_type: (practice_type && practice_type !== '' && practice_type !== '0') ? parseInt(practice_type) : null,
        // COMENTADO: faculty_id eliminado - ya no se usa
        start_date,
        finish_date,
        alert_value: alert_value || 0,
        alert_unit: alert_unit || null,
        alert_when: alert_when_value
      });

      // Actualizar también en MongoDB con los totales calculados
      evaluationMongo.total_students = totals.total_students;
      evaluationMongo.total_bosses = totals.total_bosses;
      evaluationMongo.total_monitors = totals.total_monitors;
      await evaluationMongo.save();
    } catch (calcError) {
      console.error('Error al calcular totales (no crítico):', calcError);
      // No fallar la creación si el cálculo falla, solo loguear el error
    }

    // Obtener la evaluación creada desde MySQL con datos enriquecidos
    const [evaluations] = await pool.query(`
      SELECT 
        e.evaluation_id as id,
        e.name,
        e.period,
        e.type_survey,
        e.practice_type,
        e.total_bosses,
        e.total_students,
        e.percentage_bosses,
        e.percentage_students,
        e.start_date,
        e.finish_date,
        e.status,
        e.date_creation,
        e.user_creator
      FROM evaluations e
      WHERE e.evaluation_id = ?
    `, [evaluation_id]);

    res.status(201).json({
      message: 'Evaluación creada correctamente en MySQL y MongoDB',
      evaluation: evaluations[0],
      evaluation_mongo_id: evaluationMongo._id.toString()
    });
  } catch (error) {
    console.error('Error al crear evaluación:', error);
    res.status(500).json({ error: 'Error al crear evaluación', details: error.message });
  }
};

export const createMonitoringEvaluation = async (req, res) => {
  try {
    const {
      name,
      period,
      faculty_id,
      type_survey,
      categories, // Array de IDs de categorías
      start_date,
      finish_date
    } = req.body;

    // Validaciones básicas
    if (!name || !period || !start_date || !finish_date || !type_survey) {
      return res.status(400).json({ error: 'Campos requeridos: name, period, start_date, finish_date, type_survey' });
    }

    const user_creator = req.user?.email || req.user?.username || 'system';

    // Obtener los med_enc_id_* del value_for_reports del type_survey
    let med_enc_id_student = null;
    let med_enc_id_teacher = null;
    let med_enc_id_coord = null;

    if (type_survey) {
      try {
        const [items] = await pool.query(
          'SELECT value_for_reports FROM item WHERE id = ?',
          [type_survey]
        );
        
        if (items.length > 0 && items[0].value_for_reports) {
          const valueForReports = items[0].value_for_reports;
          // Parsear formato: e:ID_ESTUDIANTE;t:ID_TUTOR;m:ID_MONITOR
          // Para monitorías: e=students, t=tutors/coordinators, m=monitors/teachers
          const parts = valueForReports.split(';');
          for (const part of parts) {
            const [key, value] = part.split(':');
            const id = parseInt(value);
            if (key === 'e' && !isNaN(id)) {
              med_enc_id_student = id !== 0 ? id : null;
            } else if (key === 't' && !isNaN(id)) {
              // t: es tutor_form → coordinators
              med_enc_id_coord = id !== 0 ? id : null;
            } else if (key === 'm' && !isNaN(id)) {
              // m: es monitor_form → teachers
              med_enc_id_teacher = id !== 0 ? id : null;
            }
          }
        }
      } catch (error) {
        console.warn('⚠️  Error al obtener value_for_reports del type_survey:', error);
      }
    }

    // Insertar en la tabla monitoring_evaluation (MySQL)
    // Nota: faculty_id no se incluye para evaluaciones de monitoría
    const [result] = await pool.query(`
      INSERT INTO monitoring_evaluation (
        name, period, type_survey,
        start_date, finish_date,
        status, user_creator,
        med_enc_id_student, med_enc_id_teacher, med_enc_id_coord,
        total_teachers, total_students, total_coordinators,
        percentage_teachers, percentage_students, percentage_coords
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      period,
      type_survey,
      start_date,
      finish_date,
      'CREATED',
      user_creator,
      med_enc_id_student,
      med_enc_id_teacher,
      med_enc_id_coord,
      0, // total_teachers
      0, // total_students
      0, // total_coordinators
      0, // percentage_teachers
      0, // percentage_students
      0  // percentage_coords
    ]);

    const evaluationId = result.insertId;

    // Insertar categorías en monitoring_evaluation_category
    // La tabla tiene PRIMARY KEY (evaluation_id, category) y category es FK a item.id
    if (categories && Array.isArray(categories) && categories.length > 0) {
      try {
        // Preparar valores para INSERT múltiple: [(evaluationId, categoryId), ...]
        const categoryValues = categories.map(categoryId => [evaluationId, parseInt(categoryId)]);
        
        // INSERT múltiple más eficiente
        await pool.query(`
          INSERT INTO monitoring_evaluation_category (evaluation_id, category)
          VALUES ?
        `, [categoryValues]);
      } catch (error) {
        console.error('Error al insertar categorías:', error);
        // Si falla, intentar insertar una por una para identificar cuál falla
        for (const categoryId of categories) {
          try {
            await pool.query(`
              INSERT INTO monitoring_evaluation_category (evaluation_id, category)
              VALUES (?, ?)
            `, [evaluationId, parseInt(categoryId)]);
          } catch (singleError) {
            console.warn(`⚠️  Error al insertar categoría ${categoryId}:`, singleError);
          }
        }
      }
    }

    // Crear documento en MongoDB
    if (mongoose.connection.readyState === 1) {
      const evaluationMongo = new Evaluation({
        evaluation_id_mysql: evaluationId,
        name,
        period: parseInt(period),
        type_survey: type_survey ? parseInt(type_survey) : null,
        evaluation_type: 'MONITORING',
        categories: categories || [],
        start_date,
        finish_date,
        status: 'CREATED',
        user_creator,
        med_enc_id_student: med_enc_id_student,
        med_enc_id_teacher: med_enc_id_teacher,
        med_enc_id_coord: med_enc_id_coord,
        total_teachers: 0,
        total_students: 0,
        total_coordinators: 0,
        percentage_teachers: 0,
        percentage_students: 0,
        percentage_coords: 0
      });

      await evaluationMongo.save();

      // Calcular totales de teachers, students y coordinators
      try {
        const totals = await calculateMonitoringEvaluationTotals(evaluationId, {
          period,
          categories: categories || [],
          faculty_id: null // Las monitorías no tienen faculty_id en la evaluación
        });

        // Actualizar también en MongoDB con los totales calculados
        evaluationMongo.total_teachers = totals.total_teachers;
        evaluationMongo.total_students = totals.total_students;
        evaluationMongo.total_coordinators = totals.total_coordinators;
        // Asegurar que evaluation_type esté guardado
        evaluationMongo.evaluation_type = 'MONITORING';
        await evaluationMongo.save();
      } catch (calcError) {
        console.error('⚠️  Error al calcular totales (no crítico):', calcError);
        // No fallar la creación si el cálculo falla
      }
    }

    res.status(201).json({
      message: 'Evaluación de monitoría creada exitosamente',
      evaluation: {
        id: evaluationId,
        name,
        period,
        type_survey,
        categories,
        start_date,
        finish_date,
        status: 'CREATED'
      }
    });
  } catch (error) {
    console.error('Error al crear evaluación de monitoría:', error);
    res.status(500).json({ 
      error: 'Error al crear evaluación de monitoría',
      details: error.message 
    });
  }
};

export const updateMonitoringEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      period,
      type_survey,
      categories,
      start_date,
      finish_date,
      status
    } = req.body;

    const user_updater = req.user?.email || req.user?.username || 'system';
    const date_updater = new Date();

    // Verificar que la evaluación existe
    const [evaluations] = await pool.query(
      'SELECT evaluation_id FROM monitoring_evaluation WHERE evaluation_id = ?',
      [id]
    );

    if (evaluations.length === 0) {
      return res.status(404).json({ error: 'Evaluación de monitoría no encontrada' });
    }

    const evaluation_id = evaluations[0].evaluation_id;

    // Obtener los med_enc_id_* del value_for_reports si se actualiza type_survey
    let med_enc_id_student = undefined;
    let med_enc_id_teacher = undefined;
    let med_enc_id_coord = undefined;

    if (type_survey !== undefined) {
      try {
        const [items] = await pool.query(
          'SELECT value_for_reports FROM item WHERE id = ?',
          [type_survey]
        );
        
        if (items.length > 0 && items[0].value_for_reports) {
          const valueForReports = items[0].value_for_reports;
          // Parsear formato: e:ID_ESTUDIANTE;t:ID_TUTOR;m:ID_MONITOR
          // Para monitorías: e=students, t=tutors/coordinators, m=monitors/teachers
          const parts = valueForReports.split(';');
          for (const part of parts) {
            const [key, value] = part.split(':');
            const itemId = parseInt(value);
            if (key === 'e' && !isNaN(itemId)) {
              med_enc_id_student = itemId !== 0 ? itemId : null;
            } else if (key === 't' && !isNaN(itemId)) {
              // t: es tutor_form → coordinators
              med_enc_id_coord = itemId !== 0 ? itemId : null;
            } else if (key === 'm' && !isNaN(itemId)) {
              // m: es monitor_form → teachers
              med_enc_id_teacher = itemId !== 0 ? itemId : null;
            }
          }
        }
      } catch (error) {
        console.warn('⚠️  Error al obtener value_for_reports del type_survey:', error);
      }
    }

    // Preparar campos para actualizar
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (period !== undefined) {
      updateFields.push('period = ?');
      updateValues.push(parseInt(period));
    }
    if (type_survey !== undefined) {
      updateFields.push('type_survey = ?');
      updateValues.push(type_survey ? parseInt(type_survey) : null);
    }
    if (start_date !== undefined) {
      updateFields.push('start_date = ?');
      updateValues.push(start_date);
    }
    if (finish_date !== undefined) {
      updateFields.push('finish_date = ?');
      updateValues.push(finish_date);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    if (med_enc_id_student !== undefined) {
      updateFields.push('med_enc_id_student = ?');
      updateValues.push(med_enc_id_student);
    }
    if (med_enc_id_teacher !== undefined) {
      updateFields.push('med_enc_id_teacher = ?');
      updateValues.push(med_enc_id_teacher);
    }
    if (med_enc_id_coord !== undefined) {
      updateFields.push('med_enc_id_coord = ?');
      updateValues.push(med_enc_id_coord);
    }

    // Siempre actualizar user_updater y date_updater
    updateFields.push('user_updater = ?');
    updateValues.push(user_updater);
    updateFields.push('date_updater = ?');
    updateValues.push(date_updater);

    // Actualizar en MySQL
    if (updateFields.length > 0) {
      updateValues.push(evaluation_id);
      await pool.query(`
        UPDATE monitoring_evaluation
        SET ${updateFields.join(', ')}
        WHERE evaluation_id = ?
      `, updateValues);
    }

    // Actualizar categorías si se proporcionan
    if (categories !== undefined && Array.isArray(categories)) {
      // Eliminar todas las categorías existentes
      await pool.query(`
        DELETE FROM monitoring_evaluation_category
        WHERE evaluation_id = ?
      `, [evaluation_id]);

      // Insertar las nuevas categorías
      if (categories.length > 0) {
        const categoryValues = categories.map(categoryId => [evaluation_id, parseInt(categoryId)]);
        await pool.query(`
          INSERT INTO monitoring_evaluation_category (evaluation_id, category)
          VALUES ?
        `, [categoryValues]);
      }
    }

    // Actualizar en MongoDB
    if (mongoose.connection.readyState === 1) {
      const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: evaluation_id });
      if (evaluationMongo) {
        if (name !== undefined) evaluationMongo.name = name;
        if (period !== undefined) evaluationMongo.period = parseInt(period);
        if (type_survey !== undefined) evaluationMongo.type_survey = type_survey ? parseInt(type_survey) : null;
        if (categories !== undefined) evaluationMongo.categories = categories || [];
        if (start_date !== undefined) evaluationMongo.start_date = start_date;
        if (finish_date !== undefined) evaluationMongo.finish_date = finish_date;
        if (status !== undefined) evaluationMongo.status = status;
        // Asegurar que evaluation_type sea MONITORING para evaluaciones de monitoría
        evaluationMongo.evaluation_type = 'MONITORING';
        evaluationMongo.user_updater = user_updater;

        // Actualizar med_enc_id_* si se actualizó type_survey
        if (med_enc_id_student !== undefined) evaluationMongo.med_enc_id_student = med_enc_id_student;
        if (med_enc_id_teacher !== undefined) evaluationMongo.med_enc_id_teacher = med_enc_id_teacher;
        if (med_enc_id_coord !== undefined) evaluationMongo.med_enc_id_coord = med_enc_id_coord;

        await evaluationMongo.save();

        // Recalcular totales si se actualizó period, categories o type_survey
        const shouldRecalculate = period !== undefined || categories !== undefined || type_survey !== undefined;
        if (shouldRecalculate) {
          try {
            // Obtener las categorías actuales de la evaluación
            const [currentCategories] = await pool.query(
              'SELECT category FROM monitoring_evaluation_category WHERE evaluation_id = ?',
              [evaluation_id]
            );
            const categoryIds = currentCategories.map(row => row.category);

            // Obtener el periodo actual
            const [currentPeriod] = await pool.query(
              'SELECT period FROM monitoring_evaluation WHERE evaluation_id = ?',
              [evaluation_id]
            );
            const currentPeriodValue = currentPeriod[0]?.period || period;

            const totals = await calculateMonitoringEvaluationTotals(evaluation_id, {
              period: currentPeriodValue,
              categories: categoryIds,
              faculty_id: null
            });

            // Actualizar también en MongoDB con los totales calculados
            evaluationMongo.total_teachers = totals.total_teachers;
            evaluationMongo.total_students = totals.total_students;
            evaluationMongo.total_coordinators = totals.total_coordinators;
            // Asegurar que evaluation_type esté guardado
            evaluationMongo.evaluation_type = 'MONITORING';
            await evaluationMongo.save();
          } catch (calcError) {
            console.error('⚠️  Error al recalcular totales (no crítico):', calcError);
            // No fallar la actualización si el cálculo falla
          }
        }
      }
    }

    res.json({
      message: 'Evaluación de monitoría actualizada exitosamente',
      evaluation: {
        id: evaluation_id,
        name,
        period,
        type_survey,
        categories,
        start_date,
        finish_date,
        status
      }
    });
  } catch (error) {
    console.error('Error al actualizar evaluación de monitoría:', error);
    res.status(500).json({ 
      error: 'Error al actualizar evaluación de monitoría',
      details: error.message 
    });
  }
};

export const getMonitoringEvaluationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Leer desde MySQL (tabla monitoring_evaluation)
    const [evaluations] = await pool.query(`
      SELECT 
        me.evaluation_id as id,
        me.name,
        me.period,
        me.type_survey,
        me.faculty_id,
        me.total_teachers,
        me.total_students,
        me.total_coordinators,
        me.percentage_teachers,
        me.percentage_students,
        me.percentage_coords,
        me.start_date,
        me.finish_date,
        me.status,
        me.date_creation,
        me.user_creator,
        me.user_updater,
        me.date_updater
      FROM monitoring_evaluation me
      WHERE me.evaluation_id = ?
    `, [id]);

    if (evaluations.length === 0) {
      return res.status(404).json({ error: 'Evaluación de monitoría no encontrada' });
    }

    const evaluation = evaluations[0];

    // Obtener categorías asociadas
    const [categories] = await pool.query(`
      SELECT category
      FROM monitoring_evaluation_category
      WHERE evaluation_id = ?
    `, [id]);

    evaluation.categories = categories.map(c => c.category);

    // Enriquecer con datos de referencia
    if (evaluation.period) {
      try {
        const [periods] = await pool.query(
          'SELECT period FROM academic_period WHERE id = ?',
          [evaluation.period]
        );
        if (periods.length > 0) {
          evaluation.period_name = periods[0].period;
        }
      } catch (err) {
        console.warn('Error al obtener período:', err);
      }
    }

    // COMENTADO: faculty_id no existe en esta BD según uao.sql
    // if (evaluation.faculty_id) {
    //   try {
    //     const [faculties] = await pool.query(
    //       'SELECT name FROM faculty WHERE faculty_id = ?',
    //       [evaluation.faculty_id]
    //     );
    //     if (faculties.length > 0) {
    //       evaluation.faculty_name = faculties[0].name;
    //     }
    //   } catch (err) {
    //     console.warn('Error al obtener facultad:', err);
    //   }
    // }

    if (evaluation.type_survey) {
      try {
        const [surveys] = await pool.query(
          'SELECT value FROM item WHERE id = ?',
          [evaluation.type_survey]
        );
        if (surveys.length > 0) {
          evaluation.type_survey_name = surveys[0].value;
        }
      } catch (err) {
        console.warn('Error al obtener tipo de encuesta:', err);
      }
    }

    res.json(evaluation);
  } catch (error) {
    console.error('Error al obtener evaluación de monitoría:', error);
    res.status(500).json({ error: 'Error al obtener evaluación de monitoría' });
  }
};

export const getMonitoringEvaluations = async (req, res) => {
  try {
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Parámetros de filtro
    const periodFilter = req.query.period || null;
    const surveyTypeFilter = req.query.type_survey || null;
    const searchTerm = req.query.search || null;

    // Construir condiciones WHERE
    const whereConditions = [];
    const queryParams = [];

    if (periodFilter) {
      whereConditions.push('me.period = ?');
      queryParams.push(periodFilter);
    }

    if (surveyTypeFilter) {
      whereConditions.push('me.type_survey = ?');
      queryParams.push(surveyTypeFilter);
    }

    if (searchTerm) {
      whereConditions.push('(me.name LIKE ? OR me.name LIKE ?)');
      const searchPattern = `%${searchTerm}%`;
      queryParams.push(searchPattern, searchPattern);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Obtener el total de evaluaciones para la paginación con filtros
    const countQuery = `SELECT COUNT(*) as total FROM monitoring_evaluation me ${whereClause}`;
    const [countResult] = await pool.query(countQuery, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Leer evaluaciones desde MySQL (tabla monitoring_evaluation) con paginación y filtros
    const query = `
      SELECT 
        me.evaluation_id as id,
        me.name,
        me.period,
        me.type_survey,
        me.faculty_id,
        me.total_teachers,
        me.total_students,
        me.total_coordinators,
        me.percentage_teachers,
        me.percentage_students,
        me.percentage_coords,
        me.start_date,
        me.finish_date,
        me.status,
        me.date_creation,
        me.user_creator,
        me.user_updater,
        me.date_updater
      FROM monitoring_evaluation me
      ${whereClause}
      ORDER BY me.date_creation DESC
      LIMIT ? OFFSET ?
    `;
    
    const [evaluations] = await pool.query(query, [...queryParams, limit, offset]);

    // Enriquecer con datos de referencia desde MySQL
    const evaluationsEnriched = await Promise.all(
      evaluations.map(async (evaluation) => {
        const result = {
          id: evaluation.id,
          name: evaluation.name,
          period: evaluation.period,
          period_name: null,
          faculty_id: evaluation.faculty_id,
          faculty_name: null,
          start_date: evaluation.start_date,
          finish_date: evaluation.finish_date,
          total_teachers: evaluation.total_teachers || 0,
          total_students: evaluation.total_students || 0,
          total_coordinators: evaluation.total_coordinators || 0,
          percentage_teachers: evaluation.percentage_teachers || 0,
          percentage_students: evaluation.percentage_students || 0,
          percentage_coords: evaluation.percentage_coords || 0,
          status: evaluation.status,
          date_creation: evaluation.date_creation,
          user_creator: evaluation.user_creator,
          user_updater: evaluation.user_updater,
          date_updater: evaluation.date_updater,
          type_survey: evaluation.type_survey,
          type_survey_name: null
        };

        // Obtener nombre del período
        if (evaluation.period) {
          try {
            const [periods] = await pool.query(
              'SELECT period FROM academic_period WHERE id = ?',
              [evaluation.period]
            );
            if (periods.length > 0) {
              result.period_name = periods[0].period;
            }
          } catch (error) {
            console.warn('Error al obtener período:', error);
          }
        }

        // COMENTADO: faculty_id no existe en esta BD según uao.sql
        // Obtener nombre de la facultad
        // if (evaluation.faculty_id) {
        //   try {
        //     const [faculties] = await pool.query(
        //       'SELECT name FROM faculty WHERE faculty_id = ?',
        //       [evaluation.faculty_id]
        //     );
        //     if (faculties.length > 0) {
        //       result.faculty_name = faculties[0].name;
        //     }
        //   } catch (error) {
        //     console.warn('Error al obtener facultad:', error);
        //   }
        // }

        // Obtener nombre del tipo de encuesta
        if (evaluation.type_survey) {
          try {
            const [items] = await pool.query(
              'SELECT value FROM item WHERE id = ?',
              [evaluation.type_survey]
            );
            if (items.length > 0) {
              result.type_survey_name = items[0].value;
            }
          } catch (error) {
            console.warn('Error al obtener tipo de encuesta:', error);
          }
        }

        return result;
      })
    );

    res.json({
      data: evaluationsEnriched,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error al obtener evaluaciones de monitoría:', error);
    res.status(500).json({ error: 'Error al obtener evaluaciones de monitoría' });
  }
};

export const getEvaluations = async (req, res) => {
  try {
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Parámetros de filtro
    const periodFilter = req.query.period || null;
    const surveyTypeFilter = req.query.type_survey || null;
    const searchTerm = req.query.search || null;

    // Construir condiciones WHERE
    const whereConditions = [];
    const queryParams = [];

    if (periodFilter) {
      whereConditions.push('e.period = ?');
      queryParams.push(periodFilter);
    }

    if (surveyTypeFilter) {
      whereConditions.push('e.type_survey = ?');
      queryParams.push(surveyTypeFilter);
    }

    if (searchTerm) {
      whereConditions.push('e.name LIKE ?');
      const searchPattern = `%${searchTerm}%`;
      queryParams.push(searchPattern);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Obtener el total de evaluaciones para la paginación con filtros
    const countQuery = `SELECT COUNT(*) as total FROM evaluations e ${whereClause}`;
    const [countResult] = await pool.query(countQuery, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Leer evaluaciones desde MySQL (tabla evaluations) con paginación y filtros
    // COMENTADO: faculty_id, date_sent, total_monitors y percentage_monitors no existen en esta BD según uao.sql
    const query = `
      SELECT 
        e.evaluation_id as id,
        e.name,
        e.period,
        e.type_survey,
        e.practice_type,
        e.total_bosses,
        e.total_students,
        e.percentage_bosses,
        e.percentage_students,
        e.start_date,
        e.finish_date,
        e.alert_value,
        e.alert_unit,
        e.alert_when,
        e.status,
        e.date_creation,
        e.user_creator,
        e.user_updater,
        e.date_updater
      FROM evaluations e
      ${whereClause}
      ORDER BY e.date_creation DESC
      LIMIT ? OFFSET ?
    `;
    
    const [evaluations] = await pool.query(query, [...queryParams, limit, offset]);

    // Enriquecer con datos de referencia desde MySQL
    const evaluationsEnriched = await Promise.all(
      evaluations.map(async (evaluation) => {
        const result = {
          id: evaluation.id,
          name: evaluation.name,
          period: evaluation.period,
          period_name: null,
          practice_type: evaluation.practice_type,
          practice_type_name: null,
          // COMENTADO: faculty_id no existe en esta BD
          // faculty_id: evaluation.faculty_id,
          // faculty_name: null,
          start_date: evaluation.start_date,
          finish_date: evaluation.finish_date,
          total_bosses: evaluation.total_bosses || 0,
          total_students: evaluation.total_students || 0,
          // COMENTADO: total_monitors y percentage_monitors no existen en esta BD según uao.sql
          total_monitors: 0, // Valor por defecto ya que la columna no existe
          percentage_bosses: evaluation.percentage_bosses || 0,
          percentage_students: evaluation.percentage_students || 0,
          percentage_monitors: 0, // Valor por defecto ya que la columna no existe
          status: evaluation.status,
          // COMENTADO: date_sent no existe en esta BD
          // date_sent: evaluation.date_sent,
          date_creation: evaluation.date_creation,
          user_creator: evaluation.user_creator,
          type_survey: evaluation.type_survey,
          type_survey_name: null
        };

        // Obtener nombre del período
        if (evaluation.period) {
          try {
            const [periods] = await pool.query(
              'SELECT period FROM academic_period WHERE id = ?',
              [evaluation.period]
            );
            if (periods.length > 0) {
              result.period_name = periods[0].period;
            }
          } catch (err) {
            console.warn('Error al obtener período:', err);
          }
        }

        // COMENTADO: faculty_id no existe en esta BD según uao.sql
        // Obtener nombre de la facultad
        // if (evaluation.faculty_id) {
        //   try {
        //     const [faculties] = await pool.query(
        //       'SELECT name FROM faculty WHERE faculty_id = ?',
        //       [evaluation.faculty_id]
        //     );
        //     if (faculties.length > 0) {
        //       result.faculty_name = faculties[0].name;
        //     }
        //   } catch (err) {
        //     console.warn('Error al obtener facultad:', err);
        //   }
        // }

        // Obtener nombre del tipo de práctica
        if (evaluation.practice_type) {
          try {
            const [practices] = await pool.query(
              'SELECT value FROM item WHERE id = ?',
              [evaluation.practice_type]
            );
            if (practices.length > 0) {
              result.practice_type_name = practices[0].value;
            }
          } catch (err) {
            console.warn('Error al obtener tipo de práctica:', err);
          }
        }

        // Obtener nombre del tipo de encuesta (type_survey)
        if (evaluation.type_survey) {
          try {
            const [surveys] = await pool.query(
              'SELECT value FROM item WHERE id = ?',
              [evaluation.type_survey]
            );
            if (surveys.length > 0) {
              result.type_survey_name = surveys[0].value;
            }
          } catch (err) {
            console.warn('Error al obtener tipo de encuesta:', err);
          }
        }

        return result;
      })
    );

    res.json({
      data: evaluationsEnriched,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener evaluaciones:', error);
    res.status(500).json({ error: 'Error al obtener evaluaciones', details: error.message });
  }
};

export const getEvaluationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Leer desde MySQL (tabla evaluations)
    // COMENTADO: faculty_id, date_sent, total_monitors y percentage_monitors no existen en esta BD según uao.sql
    const [evaluations] = await pool.query(`
      SELECT 
        e.evaluation_id as id,
        e.name,
        e.period,
        e.type_survey,
        e.practice_type,
        e.total_bosses,
        e.total_students,
        e.percentage_bosses,
        e.percentage_students,
        e.start_date,
        e.finish_date,
        e.alert_value,
        e.alert_unit,
        e.alert_when,
        e.status,
        e.date_creation,
        e.user_creator,
        e.user_updater,
        e.date_updater
      FROM evaluations e
      WHERE e.evaluation_id = ?
    `, [id]);

    if (evaluations.length === 0) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    const evaluation = evaluations[0];

    // Obtener programas asociados
    // COMENTADO: evaluation_program tiene program_id, no program_faculty_id según uao.sql
    const [programs] = await pool.query(`
      SELECT program_id
      FROM evaluation_program
      WHERE evaluation_id = ?
    `, [id]);

    evaluation.program_faculty_ids = programs.map(p => p.program_id); // Usar program_id en lugar de program_faculty_id

    // Enriquecer con datos de referencia
    if (evaluation.period) {
      try {
        const [periods] = await pool.query(
          'SELECT period FROM academic_period WHERE id = ?',
          [evaluation.period]
        );
        if (periods.length > 0) {
          evaluation.period_name = periods[0].period;
        }
      } catch (err) {
        console.warn('Error al obtener período:', err);
      }
    }

    // COMENTADO: faculty_id eliminado - ya no se usa

    if (evaluation.practice_type) {
      try {
        const [practices] = await pool.query(
          'SELECT value FROM item WHERE id = ?',
          [evaluation.practice_type]
        );
        if (practices.length > 0) {
          evaluation.practice_type_name = practices[0].value;
        }
      } catch (err) {
        console.warn('Error al obtener tipo de práctica:', err);
      }
    }

    if (evaluation.type_survey) {
      try {
        const [surveys] = await pool.query(
          'SELECT value FROM item WHERE id = ?',
          [evaluation.type_survey]
        );
        if (surveys.length > 0) {
          evaluation.type_survey_name = surveys[0].value;
        }
      } catch (err) {
        console.warn('Error al obtener tipo de encuesta:', err);
      }
    }
    
    res.json(evaluation);
  } catch (error) {
    console.error('Error al obtener evaluación:', error);
    res.status(500).json({ error: 'Error al obtener evaluación', details: error.message });
  }
};

/**
 * Obtiene la información de la evaluación y preguntas por token de acceso
 */
export const getEvaluationByAccessToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB no está conectado' });
    }

    // Buscar el token de acceso
    const accessToken = await EvaluationAccessToken.findOne({ token })
      .populate('evaluation_id');

    if (!accessToken) {
      return res.status(404).json({ error: 'Token inválido' });
    }

    // Verificar si el token ya fue usado
    if (accessToken.usado) {
      return res.status(400).json({ error: 'Este token ya fue utilizado' });
    }

    // Verificar si el token expiró
    if (new Date() > accessToken.expira_en) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    // Obtener las preguntas del Survey en MongoDB
    // El med_enc_id corresponde al item_code del formulario dentro del Survey
    const evaluation = accessToken.evaluation_id;
    const med_enc_id = accessToken.med_enc_id;
    const actorType = accessToken.actor_type;

    // Determinar si es evaluación de monitoría
    // Si evaluation_type no está definido, detectarlo por los campos de monitoría
    const isMonitoring = evaluation.evaluation_type === 'MONITORING' ||
      (actorType === 'teacher' || actorType === 'coordinator') ||
      (evaluation.med_enc_id_teacher !== undefined && evaluation.med_enc_id_teacher !== null) ||
      (evaluation.med_enc_id_coord !== undefined && evaluation.med_enc_id_coord !== null);
    
    // Si es monitoría pero no tiene evaluation_type guardado, actualizarlo
    if (isMonitoring && evaluation.evaluation_type !== 'MONITORING') {
      console.log('🔧 Actualizando evaluation_type a MONITORING para evaluación:', evaluation._id);
      await Evaluation.updateOne(
        { _id: evaluation._id },
        { $set: { evaluation_type: 'MONITORING' } }
      );
      // Actualizar el objeto en memoria para que los siguientes usos tengan el valor correcto
      evaluation.evaluation_type = 'MONITORING';
    }

    let questions = [];
    let surveyForm = null;

    // Buscar el Survey que contiene el formulario con el item_code correspondiente
    // Primero intentar buscar por survey_id_mysql de la evaluación
    let survey = null;
    if (evaluation.type_survey && typeof evaluation.type_survey === 'number') {
      survey = await Survey.findOne({ survey_id_mysql: evaluation.type_survey });
    }

    // Si no se encontró, buscar por item_code en los formularios
    if (!survey && med_enc_id) {
      survey = await Survey.findOne({
        $or: [
          { 'student_form.item_code': med_enc_id },
          { 'tutor_form.item_code': med_enc_id },
          { 'monitor_form.item_code': med_enc_id }
        ],
        status: 'ACTIVE'
      });
    }

    if (survey) {
      console.log(`✅ Survey encontrado: ${survey.name} (ID: ${survey._id})`);
      console.log(`🔍 Tipo de evaluación: ${isMonitoring ? 'MONITORING' : 'PRACTICE'}, Actor: ${actorType}, med_enc_id: ${med_enc_id}`);
      console.log(`📊 Survey forms disponibles:`, {
        student_form: survey.student_form ? `item_code: ${survey.student_form.item_code}, questions: ${survey.student_form.questions?.length || 0}` : 'no existe',
        tutor_form: survey.tutor_form ? `item_code: ${survey.tutor_form.item_code}, questions: ${survey.tutor_form.questions?.length || 0}` : 'no existe',
        monitor_form: survey.monitor_form ? `item_code: ${survey.monitor_form.item_code}, questions: ${survey.monitor_form.questions?.length || 0}` : 'no existe'
      });
      
      // Obtener el formulario correspondiente según el tipo de actor
      if (actorType === 'student' && survey.student_form) {
        surveyForm = survey.student_form;
        // Verificar que el item_code coincida (comparar como números)
        if (Number(surveyForm.item_code) === Number(med_enc_id)) {
          questions = surveyForm.questions || [];
          console.log(`✅ Formulario de estudiante encontrado con ${questions.length} preguntas`);
        } else {
          console.warn(`⚠️  item_code del student_form (${surveyForm.item_code}) no coincide con med_enc_id (${med_enc_id})`);
        }
      } else if (actorType === 'boss' && survey.tutor_form) {
        // Para prácticas: boss usa tutor_form
        surveyForm = survey.tutor_form;
        // Verificar que el item_code coincida (comparar como números)
        if (Number(surveyForm.item_code) === Number(med_enc_id)) {
          questions = surveyForm.questions || [];
          console.log(`✅ Formulario de tutor (boss) encontrado con ${questions.length} preguntas`);
        } else {
          console.warn(`⚠️  item_code del tutor_form (${surveyForm.item_code}) no coincide con med_enc_id (${med_enc_id})`);
        }
      } else if (actorType === 'monitor' && survey.monitor_form) {
        // Para prácticas: monitor usa monitor_form
        surveyForm = survey.monitor_form;
        // Verificar que el item_code coincida (comparar como números)
        if (Number(surveyForm.item_code) === Number(med_enc_id)) {
          questions = surveyForm.questions || [];
          console.log(`✅ Formulario de monitor encontrado con ${questions.length} preguntas`);
        } else {
          console.warn(`⚠️  item_code del monitor_form (${surveyForm.item_code}) no coincide con med_enc_id (${med_enc_id})`);
        }
      } else if (isMonitoring && actorType === 'teacher' && survey.monitor_form) {
        // Para monitorías: teacher usa monitor_form (el formulario de Monitor se mapea a teachers)
        surveyForm = survey.monitor_form;
        // Verificar que el item_code coincida (comparar como números)
        if (Number(surveyForm.item_code) === Number(med_enc_id)) {
          questions = surveyForm.questions || [];
          console.log(`✅ Formulario de monitor (teacher) encontrado con ${questions.length} preguntas`);
        } else {
          console.warn(`⚠️  item_code del monitor_form (${surveyForm.item_code}) no coincide con med_enc_id (${med_enc_id}) para teacher`);
        }
      } else if (isMonitoring && actorType === 'coordinator' && survey.tutor_form) {
        // Para monitorías: coordinator usa tutor_form (el formulario de Tutor se mapea a coordinators)
        surveyForm = survey.tutor_form;
        // Verificar que el item_code coincida (comparar como números)
        if (Number(surveyForm.item_code) === Number(med_enc_id)) {
          questions = surveyForm.questions || [];
          console.log(`✅ Formulario de tutor (coordinator) encontrado con ${questions.length} preguntas`);
        } else {
          console.warn(`⚠️  item_code del tutor_form (${surveyForm.item_code}) no coincide con med_enc_id (${med_enc_id}) para coordinator`);
        }
      } else {
        console.warn(`⚠️  No se encontró formulario para actor_type: ${actorType}, isMonitoring: ${isMonitoring}`);
        console.warn(`   - student_form existe: ${!!survey.student_form}`);
        console.warn(`   - tutor_form existe: ${!!survey.tutor_form}`);
        console.warn(`   - monitor_form existe: ${!!survey.monitor_form}`);
      }

      console.log(`📋 Preguntas encontradas en Survey para ${actorType}:`, questions.length);
    } else {
      console.warn(`⚠️  No se encontró Survey con med_enc_id: ${med_enc_id} o survey_id_mysql: ${evaluation.type_survey}`);
    }

    // Convertir las preguntas del formato Survey al formato esperado por el frontend
    const convertedQuestions = questions.map((q, index) => {
      // Mapear tipos de pregunta
      let tipo = 'texto';
      if (q.type === 'multiple_choice' || q.type === 'checkbox') {
        tipo = 'opcion_multiple';
      } else if (q.type === 'scale') {
        tipo = 'escala';
      } else if (q.type === 'textarea' || q.type === 'text') {
        tipo = 'texto';
      }

      // Convertir opciones
      const opciones = (q.options || []).map(opt => ({
        texto: opt.label || opt.value,
        valor: opt.value || opt.label
      }));

      return {
        _id: q._id || new mongoose.Types.ObjectId(),
        texto: q.question,
        tipo: tipo,
        opciones: opciones,
        orden: q.order || (index + 1),
        requerida: q.required !== undefined ? q.required : true,
        // Campos adicionales para escalas
        scale_min: q.scale_min,
        scale_max: q.scale_max,
        scale_labels: q.scale_labels
      };
    }).sort((a, b) => a.orden - b.orden);

    res.json({
      evaluation: {
        _id: evaluation._id,
        name: evaluation.name,
        evaluation_id_mysql: evaluation.evaluation_id_mysql
      },
      accessToken: {
        legalization_id: accessToken.legalization_id,
        actor_type: accessToken.actor_type,
        email: accessToken.email,
        med_enc_id: accessToken.med_enc_id,
        monitor_type: accessToken.monitor_type
      },
      questions: convertedQuestions
    });
  } catch (error) {
    console.error('Error al obtener evaluación por token de acceso:', error);
    res.status(500).json({ error: 'Error al obtener evaluación', details: error.message });
  }
};

/**
 * Guarda las respuestas de una evaluación usando el token de acceso
 */
export const submitEvaluationResponse = async (req, res) => {
  try {
    const { token, answers } = req.body;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB no está conectado' });
    }

    // Buscar el token de acceso
    const accessToken = await EvaluationAccessToken.findOne({ token })
      .populate('evaluation_id');

    if (!accessToken) {
      return res.status(404).json({ error: 'Token inválido' });
    }

    // Verificar si el token ya fue usado
    if (accessToken.usado) {
      return res.status(400).json({ error: 'Este token ya fue utilizado' });
    }

    // Verificar si el token expiró
    if (new Date() > accessToken.expira_en) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    const evaluation = accessToken.evaluation_id;
    const legalizationId = accessToken.legalization_id;
    const actorType = accessToken.actor_type;

    // Buscar o crear el PracticeEvaluation para esta combinación
    let practiceEvaluation = await PracticeEvaluation.findOne({
      academic_practice_legalized_id: legalizationId,
      evaluation_id: evaluation._id
    });

    if (!practiceEvaluation) {
      practiceEvaluation = new PracticeEvaluation({
        academic_practice_legalized_id: legalizationId,
        evaluation_id: evaluation._id,
        user_creator: 'system'
      });
    }

    // Guardar las respuestas según el tipo de actor
    const answersJson = JSON.stringify(answers);
    const now = new Date();

    // Determinar si es evaluación de monitoría
    const isMonitoring = evaluation.evaluation_type === 'MONITORING';

    if (actorType === 'student') {
      practiceEvaluation.med_student_id = accessToken.med_enc_id;
      practiceEvaluation.med_student_data = answersJson;
      practiceEvaluation.med_student_status = 'COMPLETED';
      practiceEvaluation.last_date_answer_student = now;
    } else if (actorType === 'boss' || (isMonitoring && actorType === 'teacher')) {
      // Para monitorías: teacher se guarda en med_boss_data
      practiceEvaluation.med_boss_id = accessToken.med_enc_id;
      practiceEvaluation.med_boss_data = answersJson;
      practiceEvaluation.med_boss_status = 'COMPLETED';
      practiceEvaluation.last_date_answer_boss = now;
    } else if (actorType === 'monitor' || (isMonitoring && actorType === 'coordinator')) {
      // Para monitorías: coordinator se guarda en med_monitor_data
      practiceEvaluation.med_monitor_id = accessToken.med_enc_id;
      practiceEvaluation.med_monitor_data = answersJson;
      practiceEvaluation.med_monitor_status = 'COMPLETED';
      practiceEvaluation.last_date_answer_monitor = now;
    }

    practiceEvaluation.user_updater = 'system';
    await practiceEvaluation.save();

    // Marcar el token como usado
    accessToken.usado = true;
    accessToken.fecha_uso = now;
    await accessToken.save();

    // Calcular y actualizar porcentajes de participación después de guardar la respuesta
    try {
      if (evaluation.evaluation_id_mysql) {
        if (isMonitoring) {
          // Para monitorías, calcular porcentajes de monitorías
          await calculateMonitoringEvaluationPercentages(evaluation.evaluation_id_mysql);
        } else {
          // Para prácticas, calcular porcentajes de prácticas
          await calculateEvaluationPercentages(evaluation.evaluation_id_mysql);
        }
      }
    } catch (percentageError) {
      console.error('⚠️  Error al calcular porcentajes después de guardar respuesta (no crítico):', percentageError);
      // No fallar el proceso si el cálculo de porcentajes falla
    }

    res.json({
      success: true,
      message: 'Respuestas guardadas correctamente',
      practiceEvaluation: {
        _id: practiceEvaluation._id,
        legalization_id: practiceEvaluation.academic_practice_legalized_id,
        actor_type: actorType
      }
    });
  } catch (error) {
    console.error('Error al guardar respuestas:', error);
    res.status(500).json({ error: 'Error al guardar respuestas', details: error.message });
  }
};

/**
 * Obtiene las respuestas de una evaluación específica por legalization_id y actor_type
 */
export const getEvaluationResponse = async (req, res) => {
  try {
    const { id } = req.params; // evaluation_id_mysql
    const { legalization_id, actor_type } = req.query;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB no está conectado' });
    }

    if (!legalization_id || !actor_type) {
      return res.status(400).json({ error: 'Se requieren legalization_id y actor_type' });
    }

    // Buscar la evaluación en MongoDB
    const evaluation = await Evaluation.findOne({ evaluation_id_mysql: parseInt(id) });
    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluación no encontrada en MongoDB' });
    }

    // Determinar si es evaluación de monitoría o práctica
    const isMonitoring = evaluation.evaluation_type === 'MONITORING';

    // Buscar las respuestas en PracticeEvaluation (se usa el mismo modelo para ambas)
    const practiceEvaluation = await PracticeEvaluation.findOne({
      academic_practice_legalized_id: parseInt(legalization_id),
      evaluation_id: evaluation._id
    });

    if (!practiceEvaluation) {
      return res.status(404).json({ error: 'No se encontraron respuestas para esta evaluación' });
    }

    // Obtener las respuestas según el tipo de actor
    let responseData = null;
    let med_enc_id = null;
    let status = null;
    let dateAnswer = null;

    if (actor_type === 'student') {
      responseData = practiceEvaluation.med_student_data;
      med_enc_id = practiceEvaluation.med_student_id;
      status = practiceEvaluation.med_student_status;
      dateAnswer = practiceEvaluation.last_date_answer_student;
    } else if (actor_type === 'boss') {
      responseData = practiceEvaluation.med_boss_data;
      med_enc_id = practiceEvaluation.med_boss_id;
      status = practiceEvaluation.med_boss_status;
      dateAnswer = practiceEvaluation.last_date_answer_boss;
    } else if (actor_type === 'monitor') {
      responseData = practiceEvaluation.med_monitor_data;
      med_enc_id = practiceEvaluation.med_monitor_id;
      status = practiceEvaluation.med_monitor_status;
      dateAnswer = practiceEvaluation.last_date_answer_monitor;
    } else if (isMonitoring && actor_type === 'teacher') {
      // Para monitorías, teacher se guarda en med_boss_data (mapeo: teacher -> boss)
      responseData = practiceEvaluation.med_boss_data;
      med_enc_id = practiceEvaluation.med_boss_id;
      status = practiceEvaluation.med_boss_status;
      dateAnswer = practiceEvaluation.last_date_answer_boss;
    } else if (isMonitoring && actor_type === 'coordinator') {
      // Para monitorías, coordinator se guarda en med_monitor_data (mapeo: coordinator -> monitor)
      responseData = practiceEvaluation.med_monitor_data;
      med_enc_id = practiceEvaluation.med_monitor_id;
      status = practiceEvaluation.med_monitor_status;
      dateAnswer = practiceEvaluation.last_date_answer_monitor;
    }

    if (!responseData) {
      return res.status(404).json({ error: 'No hay respuestas guardadas para este actor' });
    }

    // Parsear las respuestas JSON
    let answers = [];
    try {
      answers = JSON.parse(responseData);
    } catch (parseError) {
      console.error('Error al parsear respuestas:', parseError);
      return res.status(500).json({ error: 'Error al procesar las respuestas guardadas' });
    }

    // Obtener las preguntas del Survey para enriquecer las respuestas
    let questions = [];
    if (med_enc_id) {
      const survey = await Survey.findOne({
        $or: [
          { 'student_form.item_code': med_enc_id },
          { 'tutor_form.item_code': med_enc_id },
          { 'monitor_form.item_code': med_enc_id }
        ],
        status: 'ACTIVE'
      });

      if (survey) {
        let surveyForm = null;
        if (actor_type === 'student' && survey.student_form) {
          surveyForm = survey.student_form;
        } else if ((actor_type === 'boss' || (isMonitoring && actor_type === 'teacher')) && survey.tutor_form) {
          // Para prácticas: boss usa tutor_form, para monitorías: teacher usa tutor_form
          surveyForm = survey.tutor_form;
        } else if ((actor_type === 'monitor' || (isMonitoring && actor_type === 'coordinator')) && survey.monitor_form) {
          // Para prácticas: monitor usa monitor_form, para monitorías: coordinator usa monitor_form
          surveyForm = survey.monitor_form;
        }

        if (surveyForm) {
          questions = surveyForm.questions || [];
        }
      }
    }

    // Combinar preguntas con respuestas
    const enrichedAnswers = answers.map(answer => {
      const question = questions.find(q => q._id.toString() === answer.pregunta_id);
      return {
        pregunta_id: answer.pregunta_id,
        respuesta: answer.respuesta,
        pregunta_texto: question ? question.question : 'Pregunta no encontrada',
        pregunta_tipo: question ? question.type : null,
        pregunta_opciones: question ? question.options : null
      };
    });

    res.json({
      evaluation: {
        _id: evaluation._id,
        name: evaluation.name,
        evaluation_id_mysql: evaluation.evaluation_id_mysql
      },
      legalization_id: parseInt(legalization_id),
      actor_type: actor_type,
      status: status,
      date_answer: dateAnswer,
      answers: enrichedAnswers
    });
  } catch (error) {
    console.error('Error al obtener respuestas de evaluación:', error);
    res.status(500).json({ error: 'Error al obtener respuestas', details: error.message });
  }
};

export const getEvaluationMongoDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar la evaluación en MongoDB usando el evaluation_id_mysql
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB no está conectado' });
    }

    const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: parseInt(id) });
    
    if (!evaluationMongo) {
      return res.status(404).json({ error: 'Evaluación no encontrada en MongoDB' });
    }

    // Obtener tokens de acceso generados
    const accessTokens = await EvaluationAccessToken.find({ 
      evaluation_id: evaluationMongo._id 
    }).sort({ actor_type: 1, legalization_id: 1 });

    // Crear mapas para asociar links con correos
    const studentLinksMap = new Map();
    const bossLinksMap = new Map();
    const monitorLinksMap = new Map();
    const teacherLinksMap = new Map();
    const coordinatorLinksMap = new Map();

    accessTokens.forEach(token => {
      const key = token.legalization_id;
      const linkData = {
        token: token.token,
        link: token.link,
        usado: token.usado,
        fecha_uso: token.fecha_uso,
        expira_en: token.expira_en
      };

      if (token.actor_type === 'student') {
        studentLinksMap.set(key, linkData);
      } else if (token.actor_type === 'boss') {
        bossLinksMap.set(key, linkData);
      } else if (token.actor_type === 'monitor') {
        monitorLinksMap.set(key, linkData);
      } else if (token.actor_type === 'teacher') {
        teacherLinksMap.set(key, linkData);
      } else if (token.actor_type === 'coordinator') {
        coordinatorLinksMap.set(key, linkData);
      }
    });

    // Enriquecer correos con sus links
    const studentEmailsWithLinks = (evaluationMongo.student_emails || []).map(item => ({
      ...item.toObject ? item.toObject() : item,
      link: studentLinksMap.get(item.legalization_id)?.link || null,
      token: studentLinksMap.get(item.legalization_id)?.token || null,
      usado: studentLinksMap.get(item.legalization_id)?.usado || false,
      fecha_uso: studentLinksMap.get(item.legalization_id)?.fecha_uso || null,
      expira_en: studentLinksMap.get(item.legalization_id)?.expira_en || null
    }));

    const bossEmailsWithLinks = (evaluationMongo.boss_emails || []).map(item => ({
      ...item.toObject ? item.toObject() : item,
      link: bossLinksMap.get(item.legalization_id)?.link || null,
      token: bossLinksMap.get(item.legalization_id)?.token || null,
      usado: bossLinksMap.get(item.legalization_id)?.usado || false,
      fecha_uso: bossLinksMap.get(item.legalization_id)?.fecha_uso || null,
      expira_en: bossLinksMap.get(item.legalization_id)?.expira_en || null
    }));

    const monitorEmailsWithLinks = (evaluationMongo.monitor_emails || []).map(item => ({
      ...item.toObject ? item.toObject() : item,
      link: monitorLinksMap.get(item.legalization_id)?.link || null,
      token: monitorLinksMap.get(item.legalization_id)?.token || null,
      usado: monitorLinksMap.get(item.legalization_id)?.usado || false,
      fecha_uso: monitorLinksMap.get(item.legalization_id)?.fecha_uso || null,
      expira_en: monitorLinksMap.get(item.legalization_id)?.expira_en || null
    }));

    const teacherEmailsWithLinks = (evaluationMongo.teacher_emails || []).map(item => ({
      ...item.toObject ? item.toObject() : item,
      link: teacherLinksMap.get(item.legalization_id)?.link || null,
      token: teacherLinksMap.get(item.legalization_id)?.token || null,
      usado: teacherLinksMap.get(item.legalization_id)?.usado || false,
      fecha_uso: teacherLinksMap.get(item.legalization_id)?.fecha_uso || null,
      expira_en: teacherLinksMap.get(item.legalization_id)?.expira_en || null
    }));

    const coordinatorEmailsWithLinks = (evaluationMongo.coordinator_emails || []).map(item => ({
      ...item.toObject ? item.toObject() : item,
      link: coordinatorLinksMap.get(item.legalization_id)?.link || null,
      token: coordinatorLinksMap.get(item.legalization_id)?.token || null,
      usado: coordinatorLinksMap.get(item.legalization_id)?.usado || false,
      fecha_uso: coordinatorLinksMap.get(item.legalization_id)?.fecha_uso || null,
      expira_en: coordinatorLinksMap.get(item.legalization_id)?.expira_en || null
    }));

    // Convertir a objeto plano y formatear fechas
    const evaluationData = {
      _id: evaluationMongo._id.toString(),
      evaluation_id_mysql: evaluationMongo.evaluation_id_mysql,
      name: evaluationMongo.name,
      period: evaluationMongo.period,
      practice_type: evaluationMongo.practice_type,
      // COMENTADO: faculty_id eliminado - ya no se usa
      type_survey: evaluationMongo.type_survey,
      evaluation_type: evaluationMongo.evaluation_type,
      med_enc_id_student: evaluationMongo.med_enc_id_student,
      med_enc_id_boss: evaluationMongo.med_enc_id_boss,
      med_enc_id_monitor: evaluationMongo.med_enc_id_monitor,
      med_enc_id_teacher: evaluationMongo.med_enc_id_teacher,
      med_enc_id_coord: evaluationMongo.med_enc_id_coord,
      total_bosses: evaluationMongo.total_bosses,
      total_students: evaluationMongo.total_students,
      total_monitors: evaluationMongo.total_monitors,
      total_teachers: evaluationMongo.total_teachers,
      total_coordinators: evaluationMongo.total_coordinators,
      percentage_bosses: evaluationMongo.percentage_bosses,
      percentage_students: evaluationMongo.percentage_students,
      percentage_monitors: evaluationMongo.percentage_monitors,
      percentage_teachers: evaluationMongo.percentage_teachers,
      percentage_coords: evaluationMongo.percentage_coords,
      start_date: evaluationMongo.start_date,
      finish_date: evaluationMongo.finish_date,
      alert_value: evaluationMongo.alert_value,
      alert_unit: evaluationMongo.alert_unit,
      alert_when: evaluationMongo.alert_when,
      program_faculty_ids: evaluationMongo.program_faculty_ids,
      status: evaluationMongo.status,
      user_creator: evaluationMongo.user_creator,
      user_updater: evaluationMongo.user_updater,
      createdAt: evaluationMongo.createdAt,
      updatedAt: evaluationMongo.updatedAt,
      // Correos con sus legalization_id y links
      student_emails: studentEmailsWithLinks,
      boss_emails: bossEmailsWithLinks,
      monitor_emails: monitorEmailsWithLinks,
      teacher_emails: teacherEmailsWithLinks,
      coordinator_emails: coordinatorEmailsWithLinks
    };

    res.json(evaluationData);
  } catch (error) {
    console.error('Error al obtener detalles de MongoDB:', error);
    res.status(500).json({ error: 'Error al obtener detalles de MongoDB', details: error.message });
  }
};

export const updateEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      period,
      practice_type,
      faculty_id,
      program_faculty_ids,
      // COMENTADO: faculty_id eliminado - ya no se usa
      type_survey,
      start_date,
      finish_date,
      alert_value,
      alert_unit,
      alert_when,
      status
    } = req.body;

    const user_updater = req.user?.email || req.user?.username || 'system';
    const date_updater = new Date();

    // PASO 1: Buscar la evaluación en MySQL usando el ID
    const [evaluations] = await pool.query(
      'SELECT evaluation_id FROM evaluations WHERE evaluation_id = ?',
      [id]
    );

    if (evaluations.length === 0) {
      return res.status(404).json({ error: 'Evaluación no encontrada en MySQL' });
    }

    const evaluation_id = evaluations[0].evaluation_id;

    // PASO 1.5: Si se actualiza type_survey, obtener los med_enc_id_* del value_for_reports
    let med_enc_id_student = undefined;
    let med_enc_id_boss = undefined;
    let med_enc_id_monitor = undefined;

    if (type_survey !== undefined) {
      try {
        const [items] = await pool.query(
          'SELECT value_for_reports FROM item WHERE id = ?',
          [type_survey]
        );
        
        if (items.length > 0 && items[0].value_for_reports) {
          const valueForReports = items[0].value_for_reports;
          // Parsear formato: e:ID_ESTUDIANTE;t:ID_TUTOR;m:ID_MONITOR
          const parts = valueForReports.split(';');
          for (const part of parts) {
            const [key, value] = part.split(':');
            const id = parseInt(value);
            if (key === 'e' && !isNaN(id)) {
              med_enc_id_student = id !== 0 ? id : null;
            } else if (key === 't' && !isNaN(id)) {
              med_enc_id_boss = id !== 0 ? id : null;
            } else if (key === 'm' && !isNaN(id)) {
              med_enc_id_monitor = id !== 0 ? id : null;
            }
          }
          console.log('📋 IDs de encuestas actualizados:', {
            med_enc_id_student,
            med_enc_id_boss,
            med_enc_id_monitor
          });
        }
      } catch (error) {
        console.warn('⚠️  Error al obtener value_for_reports del type_survey:', error);
      }
    }

    // PASO 2: Preparar los campos para actualizar en MySQL
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (period !== undefined) {
      updateFields.push('period = ?');
      updateValues.push(parseInt(period));
    }
    if (type_survey !== undefined) {
      updateFields.push('type_survey = ?');
      updateValues.push(type_survey ? parseInt(type_survey) : null);
    }
    if (practice_type !== undefined) {
      updateFields.push('practice_type = ?');
      updateValues.push(practice_type ? parseInt(practice_type) : null);
    }
    // COMENTADO: faculty_id eliminado - ya no se usa
    if (start_date !== undefined) {
      updateFields.push('start_date = ?');
      updateValues.push(start_date);
    }
    if (finish_date !== undefined) {
      updateFields.push('finish_date = ?');
      updateValues.push(finish_date);
    }
    if (alert_value !== undefined) {
      updateFields.push('alert_value = ?');
      updateValues.push(alert_value || 0);
    }
    if (alert_unit !== undefined) {
      updateFields.push('alert_unit = ?');
      updateValues.push(alert_unit || null);
    }
    if (alert_when !== undefined) {
      updateFields.push('alert_when = ?');
      updateValues.push(alert_when || null);
    }
    // NO actualizar status en MySQL si es "SENT" hasta que los correos se envíen correctamente
    // Se actualizará después de enviar los correos
    if (status !== undefined && status !== 'SENT') {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    // Si el status es "SENT", NO lo agregamos aquí, se actualizará después de enviar correos
    if (med_enc_id_student !== undefined) {
      updateFields.push('med_enc_id_student = ?');
      updateValues.push(med_enc_id_student);
    }
    if (med_enc_id_boss !== undefined) {
      updateFields.push('med_enc_id_boss = ?');
      updateValues.push(med_enc_id_boss);
    }
    if (med_enc_id_monitor !== undefined) {
      updateFields.push('med_enc_id_monitor = ?');
      updateValues.push(med_enc_id_monitor);
    }

    // Siempre actualizar user_updater y date_updater
    updateFields.push('user_updater = ?');
    updateValues.push(user_updater);
    updateFields.push('date_updater = ?');
    updateValues.push(date_updater);

    // Actualizar en MySQL
    if (updateFields.length > 0) {
      updateValues.push(evaluation_id);
      await pool.query(
        `UPDATE evaluations SET ${updateFields.join(', ')} WHERE evaluation_id = ?`,
        updateValues
      );
    }

    // PASO 3: Actualizar programas asociados si se proporcionan
    if (program_faculty_ids !== undefined) {
      // Eliminar programas existentes
      await pool.query(
        'DELETE FROM evaluation_program WHERE evaluation_id = ?',
        [evaluation_id]
      );

      // Insertar nuevos programas
      // COMENTADO: evaluation_program tiene program_id, no program_faculty_id según uao.sql
      if (program_faculty_ids && program_faculty_ids.length > 0) {
        const programValues = program_faculty_ids.map(program_id => [evaluation_id, program_id]);
        await pool.query(
          `INSERT INTO evaluation_program (evaluation_id, program_id) VALUES ?`,
          [programValues]
        );
      }
    }

    // PASO 4: Actualizar también en MongoDB si existe
    let previousStatus = null;
    if (mongoose.connection.readyState === 1) {
      const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: evaluation_id });
      if (evaluationMongo) {
        // Guardar el status anterior antes de actualizarlo
        previousStatus = evaluationMongo.status;
        
        if (name !== undefined) evaluationMongo.name = name;
        if (period !== undefined) evaluationMongo.period = parseInt(period);
        if (practice_type !== undefined) evaluationMongo.practice_type = practice_type ? parseInt(practice_type) : null;
        // COMENTADO: faculty_id eliminado - ya no se usa
        if (program_faculty_ids !== undefined) evaluationMongo.program_faculty_ids = program_faculty_ids || [];
        if (start_date !== undefined) evaluationMongo.start_date = new Date(start_date);
        if (finish_date !== undefined) evaluationMongo.finish_date = new Date(finish_date);
        if (alert_value !== undefined) evaluationMongo.alert_value = alert_value || 0;
        if (alert_unit !== undefined) evaluationMongo.alert_unit = alert_unit || null;
        if (alert_when !== undefined) evaluationMongo.alert_when = alert_when || null;
        // NO actualizar status en MongoDB si es "SENT" hasta que los correos se envíen correctamente
        if (status !== undefined && status !== 'SENT') {
          evaluationMongo.status = status;
        }
        // Actualizar type_survey (guardar el ID numérico de MySQL)
        if (type_survey !== undefined) {
          evaluationMongo.type_survey = type_survey ? parseInt(type_survey) : null;
        }
        // Actualizar med_enc_id_* si se calcularon
        if (med_enc_id_student !== undefined) evaluationMongo.med_enc_id_student = med_enc_id_student;
        if (med_enc_id_boss !== undefined) evaluationMongo.med_enc_id_boss = med_enc_id_boss;
        if (med_enc_id_monitor !== undefined) evaluationMongo.med_enc_id_monitor = med_enc_id_monitor;
        
        // Actualizar user_updater en MongoDB
        evaluationMongo.user_updater = user_updater;
        if (med_enc_id_boss !== undefined) evaluationMongo.med_enc_id_boss = med_enc_id_boss;
        if (med_enc_id_monitor !== undefined) evaluationMongo.med_enc_id_monitor = med_enc_id_monitor;
        evaluationMongo.user_updater = user_updater;
        await evaluationMongo.save();
        console.log('✅ Evaluación actualizada en MongoDB con med_enc_id_*:', {
          med_enc_id_student: evaluationMongo.med_enc_id_student,
          med_enc_id_boss: evaluationMongo.med_enc_id_boss,
          med_enc_id_monitor: evaluationMongo.med_enc_id_monitor
        });

        // PASO 4.5: Si el status cambió a "SENT", enviar correos usando datos ya guardados
        if (status !== undefined && status === 'SENT' && previousStatus !== 'SENT') {
          // IMPORTANTE: NO actualizar el estado en MySQL hasta que los correos se envíen correctamente
          try {
            // Obtener todos los tokens de acceso ya generados
            const accessTokens = await EvaluationAccessToken.find({
              evaluation_id: evaluationMongo._id
            });

            // Crear mapas de tokens por legalization_id y actor_type
            const tokenMap = new Map();
            accessTokens.forEach(token => {
              const key = `${token.actor_type}_${token.legalization_id}_${token.monitor_type || ''}`;
              tokenMap.set(key, token);
            });

            let emailsSent = 0;
            let emailsFailed = 0;

            // Obtener nombres de una sola vez para todos los legalization_ids únicos
            const allLegalizationIds = [
              ...new Set([
                ...(evaluationMongo.student_emails || []).map(e => e.legalization_id),
                ...(evaluationMongo.boss_emails || []).map(e => e.legalization_id),
                ...(evaluationMongo.monitor_emails || []).map(e => e.legalization_id)
              ])
            ];

            if (allLegalizationIds.length === 0) {
              console.warn('⚠️  No hay legalization_ids para enviar correos');
              evaluationMongo.email_status = 'FAILED';
              await evaluationMongo.save();
              // Revertir el status en MySQL
              await pool.query(
                'UPDATE evaluations SET status = ? WHERE evaluation_id = ?',
                [previousStatus, evaluation_id]
              );
              throw new Error('No hay datos para enviar correos');
            }

            // Consulta única para obtener todos los nombres necesarios
            const [nameData] = await pool.query(`
              SELECT 
                apl.academic_practice_legalized_id,
                CONCAT(COALESCE(u_student.name, ''), ' ', COALESCE(u_student.last_name, '')) as student_name,
                CONCAT(COALESCE(pb.first_name, ''), ' ', COALESCE(pb.last_name, '')) as boss_name,
                CONCAT(COALESCE(u_monitor.name, ''), ' ', COALESCE(u_monitor.last_name, '')) as monitor_name,
                pr.name as program_name
              FROM academic_practice_legalized apl
              LEFT JOIN postulant p ON apl.postulant_apl = p.postulant_id
              LEFT JOIN user u_student ON p.postulant_id = u_student.id
              LEFT JOIN practice_boss pb ON apl.boss_apl = pb.boss_id
              -- COMENTADO: user_tutor y user_tutor_2 no existen, usar teacher si es necesario
              LEFT JOIN user u_monitor ON apl.teacher = u_monitor.id
              LEFT JOIN program pr ON apl.program_apl = pr.id
              WHERE apl.academic_practice_legalized_id IN (?)
            `, [allLegalizationIds]);

            // Crear mapa de nombres por legalization_id
            const nameMap = new Map();
            nameData.forEach(row => {
              nameMap.set(row.academic_practice_legalized_id, {
                studentName: row.student_name?.trim() || 'Estudiante',
                bossName: row.boss_name?.trim() || 'Tutor',
                monitorName: row.monitor_name?.trim() || 'Monitor',
                programName: row.program_name || 'Programa'
              });
            });

            // TEMPORAL: Enviar todos los correos a juan.patino para pruebas
            // TODO: Cambiar a los correos reales cuando esté listo para producción
            const testEmail = 'juan.patino@mozartai.com.co';

            // Enviar correos a estudiantes (todos a juan.patino por ahora)
            if (evaluationMongo.student_emails && evaluationMongo.student_emails.length > 0) {
              for (const studentEmail of evaluationMongo.student_emails) {
                const token = tokenMap.get(`student_${studentEmail.legalization_id}_`);
                if (token && token.link) {
                  const names = nameMap.get(studentEmail.legalization_id) || {};
                  try {
                    const sent = await sendPracticeEvaluationEmail({
                      to: testEmail, // TEMPORAL: usar testEmail en lugar de studentEmail.email
                      actorType: 'student',
                      studentName: names.studentName,
                      programName: names.programName,
                      link: token.link
                    });
                    if (sent) emailsSent++;
                    else emailsFailed++;
                  } catch (error) {
                    console.error(`Error al enviar correo a estudiante:`, error);
                    emailsFailed++;
                  }
                }
              }
            }

            // Enviar correos a tutores (todos a juan.patino por ahora)
            if (evaluationMongo.boss_emails && evaluationMongo.boss_emails.length > 0) {
              for (const bossEmail of evaluationMongo.boss_emails) {
                const token = tokenMap.get(`boss_${bossEmail.legalization_id}_`);
                if (token && token.link) {
                  const names = nameMap.get(bossEmail.legalization_id) || {};
                  try {
                    const sent = await sendPracticeEvaluationEmail({
                      to: testEmail, // TEMPORAL: usar testEmail en lugar de bossEmail.email
                      actorType: 'boss',
                      studentName: names.studentName,
                      tutorName: names.bossName,
                      programName: names.programName,
                      link: token.link
                    });
                    if (sent) emailsSent++;
                    else emailsFailed++;
                  } catch (error) {
                    console.error(`Error al enviar correo a tutor:`, error);
                    emailsFailed++;
                  }
                }
              }
            }

            // Enviar correos a monitores (todos a juan.patino por ahora)
            if (evaluationMongo.monitor_emails && evaluationMongo.monitor_emails.length > 0) {
              for (const monitorEmail of evaluationMongo.monitor_emails) {
                const token = tokenMap.get(`monitor_${monitorEmail.legalization_id}_${monitorEmail.monitor_type || ''}`);
                if (token && token.link) {
                  const names = nameMap.get(monitorEmail.legalization_id) || {};
                  try {
                    const sent = await sendPracticeEvaluationEmail({
                      to: testEmail, // TEMPORAL: usar testEmail en lugar de monitorEmail.email
                      actorType: 'monitor',
                      studentName: names.studentName,
                      tutorName: names.monitorName,
                      programName: names.programName,
                      link: token.link
                    });
                    if (sent) emailsSent++;
                    else emailsFailed++;
                  } catch (error) {
                    console.error(`Error al enviar correo a monitor:`, error);
                    emailsFailed++;
                  }
                }
              }
            }

            // Actualizar email_status y date_sent en MongoDB SOLO si se enviaron correos
            if (emailsSent > 0) {
              // Actualizar status en MySQL SOLO si los correos se enviaron correctamente
              // COMENTADO: date_sent no existe en esta BD según uao.sql
              await pool.query(
                'UPDATE evaluations SET status = ? WHERE evaluation_id = ?',
                ['SENT', evaluation_id]
              );
              
              // Actualizar status en MongoDB también SOLO después de enviar correos
              evaluationMongo.status = 'SENT';
              evaluationMongo.email_status = emailsFailed === 0 ? 'SENT' : 'PARTIAL';
              evaluationMongo.date_sent = new Date();
              await evaluationMongo.save();
              console.log(`✅ ${emailsSent} correos enviados, ${emailsFailed} fallaron`);
            } else {
              // Si no se pudo enviar ningún correo, NO actualizar status en MySQL ni MongoDB
              evaluationMongo.email_status = 'FAILED';
              // NO actualizar evaluationMongo.status, mantener el anterior (no se cambió porque status !== 'SENT')
              await evaluationMongo.save();
              console.log('⚠️  No se pudo enviar ningún correo, status NO actualizado');
              throw new Error('No se pudo enviar ningún correo. El estado no fue actualizado.');
            }
          } catch (emailError) {
            console.error('❌ Error al enviar correos:', emailError);
            // NO actualizar status en MongoDB, mantener el anterior (no se cambió porque status !== 'SENT')
            evaluationMongo.email_status = 'FAILED';
            await evaluationMongo.save();
            // Lanzar el error para que el frontend lo reciba
            throw emailError;
          }
        }
      }
    }

    // Obtener la evaluación actualizada desde MySQL
    // COMENTADO: faculty_id, date_sent, total_monitors y percentage_monitors no existen en esta BD según uao.sql
    const [updatedEvaluations] = await pool.query(`
      SELECT 
        e.evaluation_id as id,
        e.name,
        e.period,
        e.type_survey,
        e.practice_type,
        e.total_bosses,
        e.total_students,
        e.percentage_bosses,
        e.percentage_students,
        e.start_date,
        e.finish_date,
        e.alert_value,
        e.alert_unit,
        e.alert_when,
        e.status,
        e.date_creation,
        e.user_creator,
        e.user_updater,
        e.date_updater
      FROM evaluations e
      WHERE e.evaluation_id = ?
    `, [evaluation_id]);

    const updatedEvaluation = updatedEvaluations[0];

    // PASO 5: Recalcular los totales después de la actualización
    try {
      await calculateEvaluationTotals(evaluation_id, {
        period: updatedEvaluation.period,
        practice_type: updatedEvaluation.practice_type,
        // COMENTADO: faculty_id no existe en esta BD
        // faculty_id: updatedEvaluation.faculty_id,
        start_date: updatedEvaluation.start_date,
        finish_date: updatedEvaluation.finish_date,
        alert_value: updatedEvaluation.alert_value,
        alert_unit: updatedEvaluation.alert_unit,
        alert_when: updatedEvaluation.alert_when
      });

      // Obtener la evaluación nuevamente con los totales actualizados
      // COMENTADO: faculty_id, date_sent, total_monitors y percentage_monitors no existen en esta BD según uao.sql
      const [finalEvaluations] = await pool.query(`
        SELECT 
          e.evaluation_id as id,
          e.name,
          e.period,
          e.type_survey,
          e.practice_type,
          e.total_bosses,
          e.total_students,
          e.percentage_bosses,
          e.percentage_students,
          e.start_date,
          e.finish_date,
          e.alert_value,
          e.alert_unit,
          e.alert_when,
          e.status,
          e.date_creation,
          e.user_creator,
          e.user_updater,
          e.date_updater
        FROM evaluations e
        WHERE e.evaluation_id = ?
      `, [evaluation_id]);

      res.json({
        message: 'Evaluación actualizada correctamente en MySQL y MongoDB. Totales recalculados.',
        evaluation: finalEvaluations[0]
      });
    } catch (calcError) {
      console.error('Error al recalcular totales después de actualizar:', calcError);
      // Aún así devolver la respuesta, pero con advertencia
      res.json({
        message: 'Evaluación actualizada correctamente en MySQL y MongoDB, pero hubo un error al recalcular totales',
        evaluation: updatedEvaluation,
        warning: 'Error al recalcular totales: ' + calcError.message
      });
    }
    } catch (error) {
      console.error('Error al actualizar evaluación:', error);
      // Si el error es por envío de correos, devolver un mensaje más específico
      if (error.message && (error.message.includes('correo') || error.message.includes('SENT'))) {
        res.status(400).json({ 
          error: 'Error al enviar correos', 
          details: error.message,
          message: 'No se pudo cambiar el estado a SENT porque hubo un error al enviar los correos. El estado no fue actualizado.'
        });
      } else {
        res.status(500).json({ error: 'Error al actualizar evaluación', details: error.message });
      }
    }
  };

export const createQuestion = async (req, res) => {
  try {
    const question = new Question(req.body);
    await question.save();
    res.status(201).json(question);
  } catch (error) {
    console.error('Error al crear pregunta:', error);
    res.status(500).json({ error: 'Error al crear pregunta' });
  }
};

export const getQuestionsByEvaluation = async (req, res) => {
  try {
    const questions = await Question.find({ evaluacion_id: req.params.id })
      .sort({ orden: 1 });
    res.json(questions);
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ error: 'Error al obtener preguntas' });
  }
};

export const generateTokens = async (req, res) => {
  try {
    const { evaluacion_id, estudiantes_ids } = req.body;
    const tokens = [];

    for (const estudiante_mysql_id of estudiantes_ids) {
      const student = await Student.findOne({ id_mysql: estudiante_mysql_id });
      
      if (!student) {
        console.warn(`Estudiante con id_mysql ${estudiante_mysql_id} no encontrado en MongoDB`);
        continue;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const tokenDoc = new Token({
        evaluacion_id,
        estudiante_id: student._id,
        token,
        expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
      });
      await tokenDoc.save();
      tokens.push(tokenDoc);
    }

    res.status(201).json(tokens);
  } catch (error) {
    console.error('Error al generar tokens:', error);
    res.status(500).json({ error: 'Error al generar tokens' });
  }
};

export const getEvaluationByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const tokenDoc = await Token.findOne({ token, usado: false })
      .populate('evaluacion_id')
      .populate('estudiante_id');

    if (!tokenDoc) {
      return res.status(404).json({ error: 'Token inválido o ya usado' });
    }

    if (new Date() > tokenDoc.expira_en) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    const questions = await Question.find({ evaluacion_id: tokenDoc.evaluacion_id._id })
      .sort({ orden: 1 });

    res.json({
      evaluation: tokenDoc.evaluacion_id,
      student: tokenDoc.estudiante_id,
      questions,
      token: tokenDoc.token
    });
  } catch (error) {
    console.error('Error al obtener evaluación por token:', error);
    res.status(500).json({ error: 'Error al obtener evaluación' });
  }
};

export const submitAnswers = async (req, res) => {
  try {
    const { token, answers } = req.body;

    const tokenDoc = await Token.findOne({ token, usado: false });
    if (!tokenDoc) {
      return res.status(404).json({ error: 'Token inválido o ya usado' });
    }

    if (new Date() > tokenDoc.expira_en) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    for (const answer of answers) {
      const answerDoc = new Answer({
        evaluacion_id: tokenDoc.evaluacion_id,
        pregunta_id: answer.pregunta_id,
        estudiante_id: tokenDoc.estudiante_id,
        respuesta: answer.respuesta
      });
      await answerDoc.save();
    }

    tokenDoc.usado = true;
    tokenDoc.fecha_uso = new Date();
    await tokenDoc.save();

    const status = await Status.findOneAndUpdate(
      {
        evaluacion_id: tokenDoc.evaluacion_id,
        estudiante_id: tokenDoc.estudiante_id
      },
      {
        completada: true,
        fecha_completada: new Date(),
        progreso: 100
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Respuestas guardadas correctamente', status });
  } catch (error) {
    console.error('Error al guardar respuestas:', error);
    res.status(500).json({ error: 'Error al guardar respuestas' });
  }
};

export const getResults = async (req, res) => {
  try {
    const { evaluacion_id } = req.params;
    
    const answers = await Answer.find({ evaluacion_id })
      .populate('pregunta_id')
      .populate('estudiante_id');
    
    const statuses = await Status.find({ evaluacion_id })
      .populate('estudiante_id');

    res.json({
      answers,
      statuses
    });
  } catch (error) {
    console.error('Error al obtener resultados:', error);
    res.status(500).json({ error: 'Error al obtener resultados' });
  }
};

export const getStudents = async (req, res) => {
  try {
    const { programa_id } = req.query;
    let query = {};
    
    if (programa_id) {
      query.programa_id = parseInt(programa_id);
    }
    
    const students = await Student.find(query).sort({ nombre: 1, apellido: 1 });
    res.json(students);
  } catch (error) {
    console.error('Error al obtener estudiantes:', error);
    res.status(500).json({ error: 'Error al obtener estudiantes' });
  }
};

// Funciones para PracticeEvaluation (evaluaciones de prácticas con múltiples actores)

export const createPracticeEvaluation = async (req, res) => {
  try {
    const { academic_practice_legalized_id, evaluation_id } = req.body;
    
    const practiceEvaluation = await PracticeEvaluation.findOneAndUpdate(
      {
        academic_practice_legalized_id,
        evaluation_id
      },
      {
        academic_practice_legalized_id,
        evaluation_id,
        user_creator: req.user.user_name || req.user.email || 'system'
      },
      { upsert: true, new: true }
    );
    
    res.status(201).json(practiceEvaluation);
  } catch (error) {
    console.error('Error al crear evaluación de práctica:', error);
    res.status(500).json({ error: 'Error al crear evaluación de práctica' });
  }
};

export const submitPracticeEvaluationAnswers = async (req, res) => {
  try {
    const { 
      academic_practice_legalized_id, 
      evaluation_id, 
      actor_type, // 'student', 'boss', 'monitor'
      answers 
    } = req.body;

    const practiceEvaluation = await PracticeEvaluation.findOne({
      academic_practice_legalized_id,
      evaluation_id
    });

    if (!practiceEvaluation) {
      return res.status(404).json({ error: 'Evaluación de práctica no encontrada' });
    }

    // Guardar respuestas según el tipo de actor
    const answersJson = JSON.stringify(answers);
    const now = new Date();

    if (actor_type === 'student') {
      practiceEvaluation.med_student_data = answersJson;
      practiceEvaluation.med_student_status = 'COMPLETED';
      practiceEvaluation.last_date_answer_student = now;
    } else if (actor_type === 'boss') {
      practiceEvaluation.med_boss_data = answersJson;
      practiceEvaluation.med_boss_status = 'COMPLETED';
      practiceEvaluation.last_date_answer_boss = now;
    } else if (actor_type === 'monitor') {
      practiceEvaluation.med_monitor_data = answersJson;
      practiceEvaluation.med_monitor_status = 'COMPLETED';
      practiceEvaluation.last_date_answer_monitor = now;
    } else {
      return res.status(400).json({ error: 'Tipo de actor inválido' });
    }

    practiceEvaluation.user_updater = req.user?.user_name || req.user?.email || 'system';
    await practiceEvaluation.save();

    res.json({ 
      message: `Respuestas de ${actor_type} guardadas correctamente`,
      practiceEvaluation 
    });
  } catch (error) {
    console.error('Error al guardar respuestas de práctica:', error);
    res.status(500).json({ error: 'Error al guardar respuestas' });
  }
};

export const sendPracticeEvaluation = async (req, res) => {
  try {
    const { 
      academic_practice_legalized_id, 
      evaluation_id, 
      actor_type // 'student', 'boss', 'monitor'
    } = req.body;

    const practiceEvaluation = await PracticeEvaluation.findOne({
      academic_practice_legalized_id,
      evaluation_id
    });

    if (!practiceEvaluation) {
      return res.status(404).json({ error: 'Evaluación de práctica no encontrada' });
    }

    const now = new Date();

    // Marcar fecha de envío según el tipo de actor
    if (actor_type === 'student') {
      practiceEvaluation.last_date_send_student = now;
      practiceEvaluation.med_student_status = 'SENT';
    } else if (actor_type === 'boss') {
      practiceEvaluation.last_date_send_boss = now;
      practiceEvaluation.med_boss_status = 'SENT';
    } else if (actor_type === 'monitor') {
      practiceEvaluation.last_date_send_monitor = now;
      practiceEvaluation.med_monitor_status = 'SENT';
    }

    await practiceEvaluation.save();

    res.json({ 
      message: `Evaluación enviada a ${actor_type}`,
      practiceEvaluation 
    });
  } catch (error) {
    console.error('Error al enviar evaluación:', error);
    res.status(500).json({ error: 'Error al enviar evaluación' });
  }
};

export const getPracticeEvaluationResults = async (req, res) => {
  try {
    const { evaluation_id } = req.params;
    const { academic_practice_legalized_id, actor_type } = req.query;

    let query = { evaluation_id };
    if (academic_practice_legalized_id) {
      query.academic_practice_legalized_id = parseInt(academic_practice_legalized_id);
    }

    const practiceEvaluations = await PracticeEvaluation.find(query);

    // Si se especifica un tipo de actor, filtrar y parsear solo esos datos
    if (actor_type) {
      const filtered = practiceEvaluations.map(pe => {
        const result = {
          academic_practice_legalized_id: pe.academic_practice_legalized_id,
          evaluation_id: pe.evaluation_id
        };

        if (actor_type === 'student' && pe.med_student_data) {
          result.data = JSON.parse(pe.med_student_data);
          result.status = pe.med_student_status;
          result.last_send = pe.last_date_send_student;
          result.last_answer = pe.last_date_answer_student;
        } else if (actor_type === 'boss' && pe.med_boss_data) {
          result.data = JSON.parse(pe.med_boss_data);
          result.status = pe.med_boss_status;
          result.last_send = pe.last_date_send_boss;
          result.last_answer = pe.last_date_answer_boss;
        } else if (actor_type === 'monitor' && pe.med_monitor_data) {
          result.data = JSON.parse(pe.med_monitor_data);
          result.status = pe.med_monitor_status;
          result.last_send = pe.last_date_send_monitor;
          result.last_answer = pe.last_date_answer_monitor;
        }

        return result;
      });

      return res.json(filtered);
    }

    // Si no se especifica actor, devolver todos los datos
    const results = practiceEvaluations.map(pe => ({
      academic_practice_legalized_id: pe.academic_practice_legalized_id,
      evaluation_id: pe.evaluation_id,
      student: pe.med_student_data ? {
        data: JSON.parse(pe.med_student_data),
        status: pe.med_student_status,
        last_send: pe.last_date_send_student,
        last_answer: pe.last_date_answer_student
      } : null,
      boss: pe.med_boss_data ? {
        data: JSON.parse(pe.med_boss_data),
        status: pe.med_boss_status,
        last_send: pe.last_date_send_boss,
        last_answer: pe.last_date_answer_boss
      } : null,
      monitor: pe.med_monitor_data ? {
        data: JSON.parse(pe.med_monitor_data),
        status: pe.med_monitor_status,
        last_send: pe.last_date_send_monitor,
        last_answer: pe.last_date_answer_monitor
      } : null
    }));

    res.json(results);
  } catch (error) {
    console.error('Error al obtener resultados de práctica:', error);
    res.status(500).json({ error: 'Error al obtener resultados' });
  }
};

/**
 * Función de prueba para enviar las 3 plantillas de correo con datos reales
 * Envía todas las plantillas a juan.patino@mozartai.com.co para revisión
 */
export const testEmailTemplates = async (req, res) => {
  try {
    const { id } = req.params; // ID de la evaluación en MySQL
    
    // Buscar la evaluación en MongoDB
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'MongoDB no está conectado' });
    }

    const evaluationMongo = await Evaluation.findOne({ evaluation_id_mysql: parseInt(id) });
    
    if (!evaluationMongo) {
      return res.status(404).json({ error: 'Evaluación no encontrada en MongoDB' });
    }

    // Obtener el primer estudiante, tutor y monitor de los emails guardados
    const firstStudent = evaluationMongo.student_emails && evaluationMongo.student_emails.length > 0 
      ? evaluationMongo.student_emails[0] 
      : null;
    const firstBoss = evaluationMongo.boss_emails && evaluationMongo.boss_emails.length > 0 
      ? evaluationMongo.boss_emails[0] 
      : null;
    const firstMonitor = evaluationMongo.monitor_emails && evaluationMongo.monitor_emails.length > 0 
      ? evaluationMongo.monitor_emails[0] 
      : null;

    if (!firstStudent || !firstBoss || !firstMonitor) {
      return res.status(400).json({ 
        error: 'La evaluación no tiene suficientes datos (estudiantes, tutores o monitores)' 
      });
    }

    // Obtener nombres y programa desde MySQL
    const [students] = await pool.query(`
      SELECT 
        p.postulant_id,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as student_name,
        pr.id as program_id,
        pr.name as program_name
      FROM academic_practice_legalized apl
      INNER JOIN postulant p ON apl.postulant_apl = p.postulant_id
      INNER JOIN user u ON p.postulant_id = u.id
      -- COMENTADO: program_faculty_apl no existe, program_apl apunta directamente a program.id
      INNER JOIN program pr ON apl.program_apl = pr.id
      WHERE apl.academic_practice_legalized_id = ?
      LIMIT 1
    `, [firstStudent.legalization_id]);

    const [bosses] = await pool.query(`
      SELECT 
        pb.boss_id,
        CONCAT(COALESCE(pb.first_name, ''), ' ', COALESCE(pb.last_name, '')) as boss_name,
        pb.email
      FROM academic_practice_legalized apl
      INNER JOIN practice_boss pb ON apl.boss_apl = pb.boss_id
      WHERE apl.academic_practice_legalized_id = ?
      LIMIT 1
    `, [firstBoss.legalization_id]);

    const [monitors] = await pool.query(`
      SELECT 
        u.id,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as monitor_name,
        u.personal_email,
        u.user_name
      FROM academic_practice_legalized apl
      -- COMENTADO: user_tutor y user_tutor_2 no existen, usar teacher si es necesario
      INNER JOIN user u ON apl.teacher = u.id
      WHERE apl.academic_practice_legalized_id = ?
      LIMIT 1
    `, [firstMonitor.legalization_id]);

    if (students.length === 0 || bosses.length === 0 || monitors.length === 0) {
      return res.status(400).json({ 
        error: 'No se pudieron obtener los datos completos desde MySQL' 
      });
    }

    const studentName = students[0].student_name?.trim() || 'Estudiante de Prueba';
    const programName = students[0].program_name || 'Programa de Prueba';
    const bossName = bosses[0].boss_name || 'Tutor de Prueba';
    const monitorName = monitors[0].monitor_name?.trim() || 'Monitor de Prueba';

    // Obtener links de los tokens
    const studentToken = await EvaluationAccessToken.findOne({
      evaluation_id: evaluationMongo._id,
      legalization_id: firstStudent.legalization_id,
      actor_type: 'student'
    });

    const bossToken = await EvaluationAccessToken.findOne({
      evaluation_id: evaluationMongo._id,
      legalization_id: firstBoss.legalization_id,
      actor_type: 'boss'
    });

    const monitorToken = await EvaluationAccessToken.findOne({
      evaluation_id: evaluationMongo._id,
      legalization_id: firstMonitor.legalization_id,
      actor_type: 'monitor',
      monitor_type: firstMonitor.monitor_type
    });

    const testEmail = 'juan.patino@mozartai.com.co';
    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const results = {
      sent: [],
      failed: []
    };

    // Enviar plantilla de estudiante
    if (studentToken) {
      try {
        const sent = await sendPracticeEvaluationEmail({
          to: testEmail,
          actorType: 'student',
          studentName,
          programName,
          link: studentToken.link || `${frontendBaseUrl}/responder-evaluacion/${studentToken.token}`
        });
        if (sent) {
          results.sent.push('Estudiante');
        } else {
          results.failed.push('Estudiante');
        }
      } catch (error) {
        console.error('Error al enviar correo de estudiante:', error);
        results.failed.push('Estudiante');
      }
    }

    // Enviar plantilla de tutor
    if (bossToken) {
      try {
        const sent = await sendPracticeEvaluationEmail({
          to: testEmail,
          actorType: 'boss',
          studentName,
          tutorName: bossName,
          programName,
          link: bossToken.link || `${frontendBaseUrl}/responder-evaluacion/${bossToken.token}`
        });
        if (sent) {
          results.sent.push('Tutor');
        } else {
          results.failed.push('Tutor');
        }
      } catch (error) {
        console.error('Error al enviar correo de tutor:', error);
        results.failed.push('Tutor');
      }
    }

    // Enviar plantilla de monitor
    if (monitorToken) {
      try {
        const sent = await sendPracticeEvaluationEmail({
          to: testEmail,
          actorType: 'monitor',
          studentName,
          tutorName: monitorName,
          programName,
          link: monitorToken.link || `${frontendBaseUrl}/responder-evaluacion/${monitorToken.token}`
        });
        if (sent) {
          results.sent.push('Monitor');
        } else {
          results.failed.push('Monitor');
        }
      } catch (error) {
        console.error('Error al enviar correo de monitor:', error);
        results.failed.push('Monitor');
      }
    }

    res.json({
      message: 'Correos de prueba enviados',
      testEmail,
      results,
      data: {
        studentName,
        programName,
        bossName,
        monitorName
      }
    });
  } catch (error) {
    console.error('Error al enviar correos de prueba:', error);
    res.status(500).json({ error: 'Error al enviar correos de prueba', details: error.message });
  }
};

/**
 * Exporta una evaluación a Excel y la devuelve como descarga
 * Basado en el script exportEvaluation321.js
 */
export const exportEvaluationReport = async (req, res) => {
  let connection;
  
  try {
    const { id } = req.params;
    const EVALUATION_ID = parseInt(id);

    if (!EVALUATION_ID || isNaN(EVALUATION_ID)) {
      return res.status(400).json({ error: 'ID de evaluación inválido' });
    }

    console.log(`🔍 Iniciando exportación de evaluación ${EVALUATION_ID}...\n`);
    
    // Conectar a MySQL
    connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL\n');

    // 1. Obtener información de la evaluación con nombres reales
    // COMENTADO: faculty_id, date_sent, total_monitors y percentage_monitors no existen en esta BD según uao.sql
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
        e.total_bosses,
        e.total_students,
        e.percentage_bosses,
        e.percentage_students,
        e.start_date,
        e.finish_date,
        e.status,
        e.date_creation,
        e.user_creator
      FROM evaluations e
      LEFT JOIN academic_period ap ON e.period = ap.id
      LEFT JOIN item i_survey ON e.type_survey = i_survey.id
      LEFT JOIN item i_practice ON e.practice_type = i_practice.id
      WHERE e.evaluation_id = ?
    `, [EVALUATION_ID]);

    if (evaluationInfo.length === 0) {
      return res.status(404).json({ error: `No se encontró la evaluación ${EVALUATION_ID}` });
    }

    const evaluation = evaluationInfo[0];
    console.log(`📋 Evaluación encontrada: ${evaluation.name}`);

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
        -- COMENTADO: user_tutor y user_tutor_2 no existen, solo usar teacher
        CONCAT(COALESCE(u_monitor1.first_name, ''), ' ', COALESCE(u_monitor1.last_name, '')) as monitor1_name,
        COALESCE(NULLIF(u_monitor1.personal_email, ''), u_monitor1.user_name) as monitor1_email,
        -- COMENTADO: monitor2 eliminado porque no hay user_tutor_2
        NULL as monitor2_name,
        NULL as monitor2_email,
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
      -- COMENTADO: program_apl apunta directamente a program.id, no necesita program_faculty
      LEFT JOIN program pr 
        ON apl.program_apl = pr.id
      -- COMENTADO: user_tutor y user_tutor_2 no existen, usar teacher si es necesario
      LEFT JOIN user u_monitor1 
        ON apl.teacher = u_monitor1.id
      WHERE pe.evaluation_id = ?
      ORDER BY pe.academic_practice_legalized_id
    `, [EVALUATION_ID]);

    console.log(`📊 Registros encontrados: ${practiceEvaluations.length}\n`);

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
      // COMENTADO: faculty_id no existe en esta BD según uao.sql
      // { field: 'Facultad', value: evaluation.faculty_name || evaluation.faculty_id },
      { field: 'Total Jefes', value: evaluation.total_bosses },
      { field: 'Total Estudiantes', value: evaluation.total_students },
      { field: 'Total Monitores', value: evaluation.total_monitors },
      { field: '% Jefes', value: evaluation.percentage_bosses },
      { field: '% Estudiantes', value: evaluation.percentage_students },
      { field: '% Monitores', value: evaluation.percentage_monitors },
      { field: 'Fecha Inicio', value: evaluation.start_date ? new Date(evaluation.start_date).toLocaleDateString('es-ES') : '' },
      { field: 'Fecha Fin', value: evaluation.finish_date ? new Date(evaluation.finish_date).toLocaleDateString('es-ES') : '' },
      { field: 'Estado', value: evaluation.status },
      // COMENTADO: date_sent no existe en esta BD según uao.sql
      // { field: 'Fecha Envío', value: evaluation.date_sent ? new Date(evaluation.date_sent).toLocaleString('es-ES') : '' },
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
          const questionId = item.medPreId || item.id || item.question_id || item.pregunta_id || (index + 1);
          let question = item.medPrePregunta || item.pregunta || item.question || item.texto || '';
          
          const closedAnswer = item.medResRespuesta || item.respuesta || item.answer || item.valor || '';
          const openAnswer = item.medEncResAbierta || item.respuesta_abierta || item.texto_libre || '';
          const answerId = item.medResId || item.respuesta_id || '';
          
          let fullAnswer = '';
          if (closedAnswer && openAnswer && openAnswer.trim() !== '') {
            fullAnswer = `${closedAnswer} - ${openAnswer}`;
          } else if (closedAnswer) {
            fullAnswer = closedAnswer;
          } else if (openAnswer && openAnswer.trim() !== '') {
            fullAnswer = openAnswer;
          }
          
          if (typeof question === 'string' && question.trim().startsWith('[')) {
            try {
              const qParsed = JSON.parse(question);
              if (Array.isArray(qParsed) && qParsed.length > 0) {
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
        return [];
      }
    }

    // Procesar cada registro
    for (const record of practiceEvaluations) {
      const legalizationId = record.academic_practice_legalized_id;

      // Procesar JEFES
      if (record.med_boss_status || record.boss_name) {
        const bossAnswers = record.med_boss_data ? parseEvaluationData(record.med_boss_data, 'boss') : [];
        
        if (bossAnswers.length > 0) {
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

      // Procesar ESTUDIANTES
      if (record.med_student_status || record.student_name) {
        const studentAnswers = record.med_student_data ? parseEvaluationData(record.med_student_data, 'student') : [];
        
        if (studentAnswers.length > 0) {
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

      // Procesar MONITORES
      if (record.med_monitor_status || record.monitor1_name) {
        const monitorAnswers = record.med_monitor_data ? parseEvaluationData(record.med_monitor_data, 'monitor') : [];
        
        if (monitorAnswers.length > 0) {
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

    // 4. Generar el archivo Excel en memoria y enviarlo como respuesta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=evaluacion_${EVALUATION_ID}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    await workbook.xlsx.write(res);
    
    console.log('✅ Exportación completada exitosamente!\n');
    
  } catch (error) {
    console.error('❌ Error durante la exportación:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al exportar evaluación', details: error.message });
    }
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
