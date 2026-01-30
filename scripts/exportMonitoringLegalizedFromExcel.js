import pool from '../src/config/mysql.js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔧 Ajusta SOLO estas variables si cambias de archivo/ubicación
const INPUT_FILE_PATH =
  'C:\\Users\\diego\\Downloads\\Evaluación por el Estudiante al Monitor_Tutor (Respuestas).xlsx';
const INPUT_SHEET_INDEX = 0; // 0 = primera hoja
const INPUT_ID_COLUMN = 2; // 2 = columna B (ID Monitoría)
const INPUT_HEADER_ROWS = 1; // filas de encabezado (se omiten)
const INPUT_COPY_COL_START = 3; // C
const INPUT_COPY_COL_END = 17; // Q (incluida)

const OUTPUT_DIR = path.join(__dirname, '../../exports');

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function itemLabel(value, valueForReports, fallbackId) {
  return valueForReports || value || (fallbackId !== null && fallbackId !== undefined ? String(fallbackId) : '');
}

function cellToPlain(cellValue) {
  // ExcelJS puede entregar: string/number/Date/{richText}/etc. Conservamos lo más “usable” posible.
  if (cellValue === null || cellValue === undefined) return '';
  if (cellValue instanceof Date) return cellValue;
  if (typeof cellValue === 'object') {
    if (cellValue.text) return String(cellValue.text);
    if (Array.isArray(cellValue.richText)) return cellValue.richText.map((t) => t.text).join('');
    if (cellValue.formula && cellValue.result !== undefined) return cellValue.result;
    // fallback seguro
    return String(cellValue);
  }
  return cellValue;
}

async function readInputRowsFromExcel(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo de entrada: ${filePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.worksheets[INPUT_SHEET_INDEX];
  if (!sheet) {
    throw new Error(`No se encontró la hoja índice ${INPUT_SHEET_INDEX} en el archivo.`);
  }

  // Encabezados del Excel original
  const headerRow = sheet.getRow(INPUT_HEADER_ROWS);
  const headerA = cellToPlain(headerRow.getCell(1)?.value) || 'Columna A';
  const headerB = cellToPlain(headerRow.getCell(INPUT_ID_COLUMN)?.value) || 'ID Monitoría';
  const headersCtoQ = [];
  for (let c = INPUT_COPY_COL_START; c <= INPUT_COPY_COL_END; c++) {
    const h = cellToPlain(headerRow.getCell(c)?.value);
    headersCtoQ.push(h || `Col ${c}`);
  }

  const occurrences = new Map(); // id -> count
  const inputRows = []; // filas del archivo (orden original)

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= INPUT_HEADER_ROWS) return;
    const idCell = row.getCell(INPUT_ID_COLUMN)?.value;
    const id = normalizeId(idCell);
    if (!id) return;

    occurrences.set(id, (occurrences.get(id) || 0) + 1);

    const colAValue = cellToPlain(row.getCell(1)?.value);
    const copied = [];
    for (let c = INPUT_COPY_COL_START; c <= INPUT_COPY_COL_END; c++) {
      copied.push(cellToPlain(row.getCell(c)?.value));
    }

    inputRows.push({
      rowNumber,
      monitoring_legalized_id: id,
      colA: colAValue,
      cToQ: copied
    });
  });

  const uniqueIds = Array.from(occurrences.keys()).sort((a, b) => a - b);
  return {
    uniqueIds,
    occurrences,
    totalRowsWithId: inputRows.length,
    inputRows,
    inputHeaders: {
      headerA,
      headerB,
      headersCtoQ
    }
  };
}

async function fetchMonitoringLegalizedInfo(connection, ids) {
  if (ids.length === 0) return [];

  const chunks = chunkArray(ids, 500);
  const results = [];

  for (const batch of chunks) {
    const [rows] = await connection.query(
      `
      SELECT
        ml.monitoring_legalized_id,
        ml.uuid,
        ml.monitoring_title,
        ml.status,
        ml.hour_limit,
        ml.locality,
        ml.cost_center,
        ml.responsable,
        ml.mail_responsable,
        ml.is_advanced,
        ml.fin_account_number,
        ml.fin_contract,
        ml.date_creation,
        ml.date_updater,
        ml.user_creator,
        ml.user_updater,

        ap.period AS period_name,
        f.name AS faculty_name,
        pr.name AS program_name,

        CONCAT(u_student.name, ' ', u_student.last_name) AS student_name,
        COALESCE(NULLIF(u_student.personal_email, ''), p.alternate_email) AS student_email,
        u_student.user_name AS student_user_name,

        CONCAT(u_teacher.name, ' ', u_teacher.last_name) AS teacher_name,
        COALESCE(NULLIF(u_teacher.personal_email, ''), u_teacher.user_name) AS teacher_email,

        CONCAT(u_coord.name, ' ', u_coord.last_name) AS coordinator_name,
        COALESCE(NULLIF(u_coord.personal_email, ''), u_coord.user_name) AS coordinator_email,

        itemLabel_cat.value AS category_value,
        itemLabel_cat.value_for_reports AS category_value_for_reports,
        ml.category AS category_id,

        itemLabel_ded.value AS dedication_value,
        itemLabel_ded.value_for_reports AS dedication_value_for_reports,
        ml.dedication_hours AS dedication_id,

        itemLabel_acc.value AS account_type_value,
        itemLabel_acc.value_for_reports AS account_type_value_for_reports,
        ml.account_type AS account_type_id,

        itemLabel_rem.value AS remuneration_value,
        itemLabel_rem.value_for_reports AS remuneration_value_for_reports,
        ml.remuneration_hour_per_week AS remuneration_id,

        itemLabel_bank.value AS bank_value,
        itemLabel_bank.value_for_reports AS bank_value_for_reports,
        ml.fin_bank AS bank_id,

        itemLabel_eps.value AS eps_value,
        itemLabel_eps.value_for_reports AS eps_value_for_reports,
        ml.eps AS eps_id,

        itemLabel_res.value AS residence_area_value,
        itemLabel_res.value_for_reports AS residence_area_value_for_reports,
        ml.residence_area AS residence_area_id,

        cse.name AS course_name,
        ml.course AS course_id,

        o.id AS opportunity_id,
        o.job_title AS opportunity_title,
        COALESCE(c.trade_name, c.business_name) AS company_name
      FROM monitoring_legalized ml
      LEFT JOIN academic_period ap ON ml.period_ml = ap.id
      LEFT JOIN faculty f ON ml.faculty_ml = f.faculty_id
      LEFT JOIN program pr ON ml.program_ml = pr.id
      LEFT JOIN postulant p ON ml.postulant_ml = p.postulant_id
      LEFT JOIN user u_student ON p.postulant_id = u_student.id

      LEFT JOIN user u_teacher ON ml.user_teacher = u_teacher.id
      LEFT JOIN user u_coord ON ml.user_coordinator = u_coord.id

      LEFT JOIN item itemLabel_cat ON ml.category = itemLabel_cat.id
      LEFT JOIN item itemLabel_ded ON ml.dedication_hours = itemLabel_ded.id
      LEFT JOIN item itemLabel_acc ON ml.account_type = itemLabel_acc.id
      LEFT JOIN item itemLabel_rem ON ml.remuneration_hour_per_week = itemLabel_rem.id
      LEFT JOIN item itemLabel_bank ON ml.fin_bank = itemLabel_bank.id
      LEFT JOIN item itemLabel_eps ON ml.eps = itemLabel_eps.id
      LEFT JOIN item itemLabel_res ON ml.residence_area = itemLabel_res.id

      LEFT JOIN course cse ON ml.course = cse.id

      LEFT JOIN opportunity o ON ml.study_working_id = o.id
      LEFT JOIN company c ON o.company_id = c.id
      WHERE ml.monitoring_legalized_id IN (?)
      `,
      [batch]
    );

    results.push(...rows);
  }

  return results;
}

async function exportToExcel({ inputHeaders, inputRows, occurrences, infoById }) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Evaluaciones';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Monitorías');
  // Columnas: A (del archivo), B (ID), C-Q (del archivo), luego enriquecido
  const columns = [
    { header: inputHeaders.headerA || 'Columna A', key: 'src_col_a', width: 22 },
    { header: inputHeaders.headerB || 'ID Monitoría', key: 'monitoring_legalized_id', width: 14 }
  ];

  inputHeaders.headersCtoQ.forEach((h, idx) => {
    columns.push({ header: String(h), key: `src_cq_${idx}`, width: 18 });
  });

  columns.push(
    { header: 'Veces en archivo (ID)', key: 'occurrences', width: 18 },
    { header: 'Encontrada', key: 'found', width: 12 },
    { header: 'Título Monitoría', key: 'monitoring_title', width: 45 },
    { header: 'Estado', key: 'status', width: 14 },
    { header: 'Período', key: 'period', width: 18 },
    { header: 'Facultad', key: 'faculty', width: 30 },
    { header: 'Programa', key: 'program', width: 35 },
    { header: 'Categoría', key: 'category', width: 28 },
    { header: 'Curso', key: 'course', width: 28 },
    { header: 'Dedicación (Horas)', key: 'dedication', width: 22 },
    { header: 'Tope Horas', key: 'hour_limit', width: 12 },
    { header: 'Tipo Cuenta', key: 'account_type', width: 18 },
    { header: 'Remuneración (Hora/Sem)', key: 'remuneration', width: 26 },
    { header: 'Banco', key: 'bank', width: 18 },
    { header: 'EPS', key: 'eps', width: 18 },
    { header: 'Zona Residencia', key: 'residence_area', width: 22 },
    { header: 'Docente', key: 'teacher_name', width: 28 },
    { header: 'Correo Docente', key: 'teacher_email', width: 28 },
    { header: 'Coordinador', key: 'coordinator_name', width: 28 },
    { header: 'Correo Coordinador', key: 'coordinator_email', width: 28 },
    { header: 'Estudiante', key: 'student_name', width: 28 },
    { header: 'Correo Estudiante', key: 'student_email', width: 28 },
    { header: 'Usuario/Código Est.', key: 'student_user_name', width: 20 },
    { header: 'Responsable', key: 'responsable', width: 28 },
    { header: 'Correo Responsable', key: 'mail_responsable', width: 28 },
    { header: 'Empresa (si aplica)', key: 'company_name', width: 28 },
    { header: 'Oferta (si aplica)', key: 'opportunity_title', width: 30 },
    { header: 'UUID', key: 'uuid', width: 38 }
  );

  sheet.columns = columns;

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const foundIds = new Set();

  for (const srcRow of inputRows) {
    const id = srcRow.monitoring_legalized_id;
    const r = infoById.get(id);
    const isFound = !!r;
    if (isFound) foundIds.add(id);

    const rowObj = {
      src_col_a: srcRow.colA,
      monitoring_legalized_id: id
    };
    srcRow.cToQ.forEach((v, idx) => {
      rowObj[`src_cq_${idx}`] = v;
    });

    rowObj.occurrences = occurrences.get(id) || 0;
    rowObj.found = isFound ? 'SI' : 'NO';

    if (r) {
      rowObj.monitoring_title = r.monitoring_title || '';
      rowObj.status = r.status || '';
      rowObj.period = r.period_name || '';
      rowObj.faculty = r.faculty_name || '';
      rowObj.program = r.program_name || '';
      rowObj.category = itemLabel(r.category_value, r.category_value_for_reports, r.category_id);
      rowObj.course = r.course_name || (r.course_id ? String(r.course_id) : '');
      rowObj.dedication = itemLabel(r.dedication_value, r.dedication_value_for_reports, r.dedication_id);
      rowObj.hour_limit = r.hour_limit ?? '';
      rowObj.account_type = itemLabel(r.account_type_value, r.account_type_value_for_reports, r.account_type_id);
      rowObj.remuneration = itemLabel(r.remuneration_value, r.remuneration_value_for_reports, r.remuneration_id);
      rowObj.bank = itemLabel(r.bank_value, r.bank_value_for_reports, r.bank_id);
      rowObj.eps = itemLabel(r.eps_value, r.eps_value_for_reports, r.eps_id);
      rowObj.residence_area = itemLabel(r.residence_area_value, r.residence_area_value_for_reports, r.residence_area_id);
      rowObj.teacher_name = r.teacher_name || '';
      rowObj.teacher_email = r.teacher_email || '';
      rowObj.coordinator_name = r.coordinator_name || '';
      rowObj.coordinator_email = r.coordinator_email || '';
      rowObj.student_name = r.student_name || '';
      rowObj.student_email = r.student_email || '';
      rowObj.student_user_name = r.student_user_name || '';
      rowObj.responsable = r.responsable || '';
      rowObj.mail_responsable = r.mail_responsable || '';
      rowObj.company_name = r.company_name || '';
      rowObj.opportunity_title = r.opportunity_title || '';
      rowObj.uuid = r.uuid || '';
    } else {
      rowObj.monitoring_title = '';
      rowObj.status = '';
      rowObj.period = '';
      rowObj.faculty = '';
      rowObj.program = '';
      rowObj.category = '';
      rowObj.course = '';
      rowObj.dedication = '';
      rowObj.hour_limit = '';
      rowObj.account_type = '';
      rowObj.remuneration = '';
      rowObj.bank = '';
      rowObj.eps = '';
      rowObj.residence_area = '';
      rowObj.teacher_name = '';
      rowObj.teacher_email = '';
      rowObj.coordinator_name = '';
      rowObj.coordinator_email = '';
      rowObj.student_name = '';
      rowObj.student_email = '';
      rowObj.student_user_name = '';
      rowObj.responsable = '';
      rowObj.mail_responsable = '';
      rowObj.company_name = '';
      rowObj.opportunity_title = '';
      rowObj.uuid = '';
    }

    sheet.addRow(rowObj);
  }

  // Hoja: IDs no encontrados
  const missingSheet = workbook.addWorksheet('IDs no encontrados');
  missingSheet.columns = [
    { header: 'ID Monitoría', key: 'id', width: 14 },
    { header: 'Veces en archivo', key: 'occurrences', width: 16 }
  ];
  missingSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  missingSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9C0006' } };

  const allIds = Array.from(occurrences.keys()).sort((a, b) => a - b);
  for (const id of allIds) {
    if (!foundIds.has(id)) {
      missingSheet.addRow({ id, occurrences: occurrences.get(id) || 0 });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const outputName = `monitorias_desde_excel_${timestamp}.xlsx`;
  const outputPath = path.join(OUTPUT_DIR, outputName);

  await workbook.xlsx.writeFile(outputPath);
  return { outputPath, found: foundIds.size, missing: allIds.length - foundIds.size };
}

async function main() {
  let connection;
  try {
    console.log(`📥 Leyendo archivo: ${INPUT_FILE_PATH}`);
    const { uniqueIds, occurrences, totalRowsWithId, inputRows, inputHeaders } =
      await readInputRowsFromExcel(INPUT_FILE_PATH);
    console.log(`✅ Filas con ID (columna B): ${totalRowsWithId}`);
    console.log(`✅ IDs únicos: ${uniqueIds.length}`);

    connection = await pool.getConnection();

    const rows = await fetchMonitoringLegalizedInfo(connection, uniqueIds);

    const infoById = new Map();
    for (const r of rows) infoById.set(r.monitoring_legalized_id, r);

    const { outputPath } = await exportToExcel({ inputHeaders, inputRows, occurrences, infoById });

    console.log(`📄 Excel generado: ${outputPath}`);
    console.log('✅ Listo');
  } catch (err) {
    console.error('❌ Error:', err?.message || err);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
  }
}

main();

