/**
 * Solo lectura: investiga qué estudiantes entran en una evaluación de prácticas
 * y por qué un estudiante dado podría no aparecer.
 *
 * Uso:
 *   cd backend && node scripts/investigateEvaluationStudentsReadonly.js
 *   node scripts/investigateEvaluationStudentsReadonly.js [mongoObjectId] [mysqlEvaluationId] [identificacion]
 *
 * Requiere .env con MYSQL_* y MONGO_URI (mismo patrón que el resto del backend).
 */
import mongoose from 'mongoose';
import pool from '../src/config/mysql.js';
import Evaluation from '../src/modules/evaluations/models/Evaluation.js';

const ESTADOS_EXCLUIDOS = ['CTP_CANCEL', 'CANCELLED', 'DELETED', 'CTP_REJECTED'];

const DEFAULT_MONGO_ID = '69b083b0f399a88a62315c77';
const DEFAULT_MYSQL_EVAL_ID = 94;
const DEFAULT_STUDENT_IDENTIFICATION = '1112495176';

function parseArgs() {
  const [,, a, b, c] = process.argv;
  return {
    mongoId: a || DEFAULT_MONGO_ID,
    mysqlEvalId: b ? parseInt(b, 10) : DEFAULT_MYSQL_EVAL_ID,
    studentIdentification: c || DEFAULT_STUDENT_IDENTIFICATION
  };
}

/**
 * Replica la construcción de WHERE de calculateEvaluationTotals (evaluations.controller.js).
 */
async function buildPracticeWhereClause(evaluationId, period, practiceType) {
  let whereConditions = ['apl.academic_period_apl = ?'];
  const queryParams = [period];

  // Igual que calculateEvaluationTotals: solo añade filtro si practice_type es truthy
  if (practiceType) {
    whereConditions.push('apl.practice_type = ?');
    queryParams.push(practiceType);
  }

  const [programsCheck] = await pool.query(
    'SELECT COUNT(*) as count FROM evaluation_program WHERE evaluation_id = ?',
    [evaluationId]
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
    queryParams.push(evaluationId);
  }

  whereConditions.push(
    `apl.status_apl NOT IN ('${ESTADOS_EXCLUIDOS.join("', '")}')`
  );

  return { whereClause: whereConditions.join(' AND '), queryParams };
}

function section(title) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

async function main() {
  const { mongoId, mysqlEvalId, studentIdentification } = parseArgs();

  section('Parámetros');
  console.log(JSON.stringify({ mongoId, mysqlEvalId, studentIdentification }, null, 2));

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI no está definido en .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const [evalRows] = await pool.query(
    `
    SELECT
      e.evaluation_id,
      e.name,
      e.period,
      e.type_survey,
      e.practice_type,
      e.status,
      e.total_students,
      e.total_bosses
    FROM evaluations e
    WHERE e.evaluation_id = ?
    `,
    [mysqlEvalId]
  );

  if (evalRows.length === 0) {
    console.error(`No existe evaluación MySQL evaluation_id=${mysqlEvalId}`);
    await mongoose.disconnect();
    await pool.end();
    process.exit(1);
  }

  const evalRow = evalRows[0];

  const [programRows] = await pool.query(
    'SELECT program_id FROM evaluation_program WHERE evaluation_id = ?',
    [mysqlEvalId]
  );
  const programIds = programRows.map((r) => r.program_id);

  section('MySQL — evaluación y programas');
  console.log(JSON.stringify({ evaluation: evalRow, evaluation_program_ids: programIds }, null, 2));

  const { whereClause, queryParams } = await buildPracticeWhereClause(
    mysqlEvalId,
    evalRow.period,
    evalRow.practice_type
  );

  section('MySQL — WHERE replicado (prácticas)');
  console.log(whereClause);
  console.log('params:', queryParams);

  const studentsWithEmailSql = `
    SELECT
      apl.academic_practice_legalized_id AS legalization_id,
      COALESCE(NULLIF(u.personal_email, ''), p.alternate_email) AS email,
      TRIM(CONCAT(IFNULL(u.name, ''), ' ', IFNULL(u.last_name, ''))) AS full_name,
      u.identification,
      pr.name AS program_name,
      apl.academic_period_apl,
      apl.practice_type,
      apl.program_apl,
      apl.status_apl
    FROM academic_practice_legalized apl
    INNER JOIN postulant p ON apl.postulant_apl = p.postulant_id
    INNER JOIN user u ON p.postulant_id = u.id
    LEFT JOIN program pr ON apl.program_apl = pr.id
    WHERE ${whereClause}
      AND (
        (u.personal_email IS NOT NULL AND u.personal_email != '')
        OR (p.alternate_email IS NOT NULL AND p.alternate_email != '')
      )
    ORDER BY apl.academic_practice_legalized_id
  `;

  const [studentsWithEmail] = await pool.query(studentsWithEmailSql, queryParams);

  const studentsNoEmailFilterSql = `
    SELECT
      apl.academic_practice_legalized_id AS legalization_id,
      COALESCE(NULLIF(u.personal_email, ''), p.alternate_email) AS resolved_email,
      u.personal_email,
      p.alternate_email,
      TRIM(CONCAT(IFNULL(u.name, ''), ' ', IFNULL(u.last_name, ''))) AS full_name,
      u.identification,
      pr.name AS program_name,
      apl.academic_period_apl,
      apl.practice_type,
      apl.program_apl,
      apl.status_apl
    FROM academic_practice_legalized apl
    INNER JOIN postulant p ON apl.postulant_apl = p.postulant_id
    INNER JOIN user u ON p.postulant_id = u.id
    LEFT JOIN program pr ON apl.program_apl = pr.id
    WHERE ${whereClause}
    ORDER BY apl.academic_practice_legalized_id
  `;

  const [studentsAllBase] = await pool.query(studentsNoEmailFilterSql, queryParams);

  const withoutUsableEmail = studentsAllBase.filter((row) => {
    const pe = row.personal_email && String(row.personal_email).trim() !== '';
    const ae = row.alternate_email && String(row.alternate_email).trim() !== '';
    return !pe && !ae;
  });

  section('MySQL — conteos (lista “oficial” con correo vs sin filtro correo)');
  console.log(
    JSON.stringify(
      {
        con_filtro_correo_como_backend: studentsWithEmail.length,
        cumplen_where_sin_exigir_correo: studentsAllBase.length,
        cumplen_where_pero_sin_correo_personal_ni_alterno: withoutUsableEmail.length
      },
      null,
      2
    )
  );

  if (withoutUsableEmail.length > 0 && withoutUsableEmail.length <= 30) {
    console.log('Muestra legalizaciones elegibles por período/tipo/programa/estado pero sin email:');
    console.log(JSON.stringify(withoutUsableEmail, null, 2));
  } else if (withoutUsableEmail.length > 30) {
    console.log(
      `Hay ${withoutUsableEmail.length} filas sin correo; omitiendo lista completa (mostrar primeras 15).`
    );
    console.log(JSON.stringify(withoutUsableEmail.slice(0, 15), null, 2));
  }

  const liveLegalizationIds = new Set(
    studentsWithEmail.map((r) => r.legalization_id)
  );

  section('Mongo — documento Evaluation');
  let mongoDoc = null;
  try {
    mongoDoc = await Evaluation.findById(mongoId).lean();
  } catch (e) {
    console.error('Error leyendo Mongo:', e.message);
  }

  if (!mongoDoc) {
    console.log(`No se encontró Evaluation con _id=${mongoId}`);
  } else {
    const summary = {
      _id: String(mongoDoc._id),
      name: mongoDoc.name,
      evaluation_id_mysql: mongoDoc.evaluation_id_mysql,
      evaluation_type: mongoDoc.evaluation_type,
      period: mongoDoc.period,
      practice_type: mongoDoc.practice_type,
      program_faculty_ids: mongoDoc.program_faculty_ids,
      student_emails_count: (mongoDoc.student_emails || []).length,
      status: mongoDoc.status
    };
    console.log(JSON.stringify(summary, null, 2));

    if (mongoDoc.evaluation_type === 'MONITORING') {
      console.warn(
        '\n⚠️  evaluation_type=MONITORING: la lógica de este script es la de PRÁCTICAS (academic_practice_legalized).'
      );
    }

    const mismatches = [];
    if (mongoDoc.evaluation_id_mysql != null && mongoDoc.evaluation_id_mysql !== mysqlEvalId) {
      mismatches.push(
        `evaluation_id_mysql en Mongo (${mongoDoc.evaluation_id_mysql}) ≠ parámetro SQL (${mysqlEvalId})`
      );
    }
    if (mongoDoc.period != null && evalRow.period != null && mongoDoc.period !== evalRow.period) {
      mismatches.push(`period Mongo (${mongoDoc.period}) ≠ period MySQL (${evalRow.period})`);
    }
    if (
      mongoDoc.practice_type != null &&
      evalRow.practice_type != null &&
      mongoDoc.practice_type !== evalRow.practice_type
    ) {
      mismatches.push(
        `practice_type Mongo (${mongoDoc.practice_type}) ≠ MySQL (${evalRow.practice_type})`
      );
    }
    const mongoProg = new Set(mongoDoc.program_faculty_ids || []);
    const sqlProg = new Set(programIds);
    const progDiff =
      [...mongoProg].filter((x) => !sqlProg.has(x)).length > 0 ||
      [...sqlProg].filter((x) => !mongoProg.has(x)).length > 0;
    if (progDiff && (mongoProg.size > 0 || sqlProg.size > 0)) {
      mismatches.push(
        `program_faculty_ids Mongo (${[...mongoProg].join(',')}) vs evaluation_program (${[...sqlProg].join(',')})`
      );
    }
    if (mismatches.length) {
      section('Inconsistencias Mongo vs MySQL (solo informativo)');
      mismatches.forEach((m) => console.log(' -', m));
    }

    const mongoIds = (mongoDoc.student_emails || []).map((s) => s.legalization_id);
    const mongoSet = new Set(mongoIds);
    const inMongoNotLive = mongoIds.filter((id) => !liveLegalizationIds.has(id));
    const inLiveNotMongo = [...liveLegalizationIds].filter((id) => !mongoSet.has(id));

    section('Mongo student_emails vs query viva (con correo)');
    console.log(
      JSON.stringify(
        {
          mongo_legalization_ids: mongoIds.length,
          live_legalization_ids: liveLegalizationIds.size,
          en_mongo_no_en_query_viva: inMongoNotLive.slice(0, 50),
          en_mongo_no_en_query_viva_count: inMongoNotLive.length,
          en_query_viva_no_en_mongo: inLiveNotMongo.slice(0, 50),
          en_query_viva_no_en_mongo_count: inLiveNotMongo.length
        },
        null,
        2
      )
    );
  }

  section(`Estudiante identificación ${studentIdentification}`);

  const [users] = await pool.query(
    `SELECT id, name, last_name, identification, personal_email, user_name
     FROM user WHERE identification = ? LIMIT 5`,
    [studentIdentification]
  );

  if (users.length === 0) {
    console.log('No hay fila en user con esa identificación.');
  } else {
    const u = users[0];
    console.log('user:', JSON.stringify(u, null, 2));

    const [postulantCheck] = await pool.query(
      'SELECT postulant_id FROM postulant WHERE postulant_id = ?',
      [u.id]
    );
    if (postulantCheck.length === 0) {
      console.log(`user.id=${u.id} no tiene fila en postulant (INNER JOIN del backend fallaría).`);
    }

    const [legalizations] = await pool.query(
      `
      SELECT
        apl.academic_practice_legalized_id,
        apl.academic_period_apl,
        apl.practice_type,
        apl.program_apl,
        apl.status_apl,
        pr.name AS program_name,
        u.personal_email,
        p.alternate_email
      FROM academic_practice_legalized apl
      INNER JOIN postulant p ON apl.postulant_apl = p.postulant_id
      INNER JOIN user u ON p.postulant_id = u.id
      LEFT JOIN program pr ON apl.program_apl = pr.id
      WHERE u.identification = ?
      ORDER BY apl.academic_practice_legalized_id DESC
      `,
      [studentIdentification]
    );

    console.log(`Legalizaciones encontradas: ${legalizations.length}`);
    const hasPrograms = programIds.length > 0;
    const programSet = new Set(programIds);

    for (const apl of legalizations) {
      const periodOk = apl.academic_period_apl === evalRow.period;
      const practiceOk =
        !evalRow.practice_type || apl.practice_type === evalRow.practice_type;
      const programOk =
        !hasPrograms || (apl.program_apl != null && programSet.has(apl.program_apl));
      const statusOk = !ESTADOS_EXCLUIDOS.includes(apl.status_apl);
      const pe = apl.personal_email && String(apl.personal_email).trim() !== '';
      const ae = apl.alternate_email && String(apl.alternate_email).trim() !== '';
      const emailOk = pe || ae;

      const passesBackendList = periodOk && practiceOk && programOk && statusOk && emailOk;

      const reasons = [];
      if (!periodOk) {
        reasons.push(
          `período apl=${apl.academic_period_apl} ≠ eval.period=${evalRow.period}`
        );
      }
      if (!practiceOk) {
        reasons.push(
          `practice_type apl=${apl.practice_type} ≠ eval.practice_type=${evalRow.practice_type}`
        );
      }
      if (!programOk) {
        reasons.push(
          hasPrograms
            ? `program_apl=${apl.program_apl} no está en evaluation_program [${programIds.join(', ')}]`
            : 'sin filtro de programa'
        );
      }
      if (!statusOk) {
        reasons.push(`status_apl=${apl.status_apl} está excluido`);
      }
      if (!emailOk) {
        reasons.push('sin personal_email ni alternate_email usable');
      }

      console.log(
        '\n--- legalization_id:',
        apl.academic_practice_legalized_id,
        '---'
      );
      console.log(
        JSON.stringify(
          {
            program_name: apl.program_name,
            checks: {
              periodOk,
              practiceOk,
              programOk,
              statusOk,
              emailOk,
              passesBackendList
            },
            motivos_si_falla: reasons.length ? reasons : ['ninguno: cumple todas las condiciones del backend']
          },
          null,
          2
        )
      );

      const inLive = liveLegalizationIds.has(apl.academic_practice_legalized_id);
      const inMongoSnapshot =
        mongoDoc &&
        (mongoDoc.student_emails || []).some(
          (s) => s.legalization_id === apl.academic_practice_legalized_id
        );
      console.log(
        'Presencia listas:',
        JSON.stringify({ en_query_viva_con_correo: inLive, en_mongo_student_emails: inMongoSnapshot })
      );
    }
  }

  section('Muestra primeras 20 filas — query viva con correo');
  console.log(JSON.stringify(studentsWithEmail.slice(0, 20), null, 2));

  await mongoose.disconnect();
  await pool.end();
  console.log('\nListo (solo lectura).\n');
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().catch(() => {});
  pool.end().catch(() => {});
  process.exit(1);
});
