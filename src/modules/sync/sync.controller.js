import pool from '../../config/mysql.js';
import Student from '../evaluations/models/Student.js';
import Boss from '../evaluations/models/Boss.js';
import Monitor from '../evaluations/models/Monitor.js';

export const syncStudents = async (req, res) => {
  try {
    // Los estudiantes están en la tabla postulant que se relaciona con user
    const [students] = await pool.query(`
      SELECT 
        p.postulant_id as id,
        u.name as nombre,
        u.last_name as apellido,
        u.personal_email as email,
        u.identification as documento
      FROM postulant p
      INNER JOIN user u ON p.postulant_id = u.id
    `);
    
    let synced = 0;
    let errors = 0;

    for (const student of students) {
      try {
        await Student.findOneAndUpdate(
          { id_mysql: student.id },
          {
            id_mysql: student.id,
            nombre: student.nombre,
            apellido: student.apellido,
            email: student.email,
            documento: student.documento
          },
          { upsert: true, new: true }
        );
        synced++;
      } catch (error) {
        console.error(`Error al sincronizar estudiante ${student.id}:`, error);
        errors++;
      }
    }

    res.json({
      message: 'Sincronización de estudiantes completada',
      total: students.length,
      synced,
      errors
    });
  } catch (error) {
    console.error('Error en sincronización:', error);
    res.status(500).json({ error: 'Error al sincronizar estudiantes' });
  }
};

export const syncBosses = async (req, res) => {
  try {
    const [bosses] = await pool.query('SELECT * FROM practice_boss');
    
    let synced = 0;
    let errors = 0;

    for (const boss of bosses) {
      try {
        await Boss.findOneAndUpdate(
          { boss_id_mysql: boss.boss_id },
          {
            boss_id_mysql: boss.boss_id,
            first_name: boss.first_name,
            last_name: boss.last_name,
            identification_type: boss.identification_type,
            identification: boss.identification,
            job: boss.job,
            email: boss.email,
            phone_number: boss.phone_number?.toString(),
            phone_extension: boss.phone_extension?.toString()
          },
          { upsert: true, new: true }
        );
        synced++;
      } catch (error) {
        console.error(`Error al sincronizar jefe ${boss.boss_id}:`, error);
        errors++;
      }
    }

    res.json({
      message: 'Sincronización de jefes completada',
      total: bosses.length,
      synced,
      errors
    });
  } catch (error) {
    console.error('Error en sincronización de jefes:', error);
    res.status(500).json({ error: 'Error al sincronizar jefes' });
  }
};

export const syncMonitors = async (req, res) => {
  try {
    // Los monitores son usuarios con rol de monitor/tutor
    // Por ahora sincronizamos todos los usuarios que podrían ser monitores
    // En producción deberías filtrar por roles específicos
    const [monitors] = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.last_name,
        u.personal_email as email,
        u.identification
      FROM user u
      WHERE u.status = 'ACTIVE'
      LIMIT 1000
    `);
    
    let synced = 0;
    let errors = 0;

    for (const monitor of monitors) {
      try {
        await Monitor.findOneAndUpdate(
          { user_id_mysql: monitor.id },
          {
            user_id_mysql: monitor.id,
            name: monitor.name,
            last_name: monitor.last_name,
            email: monitor.email,
            identification: monitor.identification
          },
          { upsert: true, new: true }
        );
        synced++;
      } catch (error) {
        console.error(`Error al sincronizar monitor ${monitor.id}:`, error);
        errors++;
      }
    }

    res.json({
      message: 'Sincronización de monitores completada',
      total: monitors.length,
      synced,
      errors
    });
  } catch (error) {
    console.error('Error en sincronización de monitores:', error);
    res.status(500).json({ error: 'Error al sincronizar monitores' });
  }
};
