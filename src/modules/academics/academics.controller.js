import pool from '../../config/mysql.js';

export const getPeriodos = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, period, status 
      FROM academic_period 
      WHERE status = 'ACTIVE' 
      ORDER BY period DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener periodos:', error);
    res.status(500).json({ error: 'Error al obtener periodos' });
  }
};

export const getFacultades = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT faculty_id as id, code, name, status 
      FROM faculty 
      WHERE status = 'ACTIVE' 
      ORDER BY name
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener facultades:', error);
    res.status(500).json({ error: 'Error al obtener facultades' });
  }
};

export const getProgramas = async (req, res) => {
  try {
    // COMENTADO: Obtener todos los programas directamente desde la tabla program
    // Ya no se requiere facultad, se muestran todos los programas disponibles
    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.code,
        p.name,
        p.level,
        p.status
      FROM program p
      WHERE p.status = 'ACTIVE'
      ORDER BY p.name
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener programas:', error);
    res.status(500).json({ error: 'Error al obtener programas' });
  }
};

export const getTiposPractica = async (req, res) => {
  try {
    // COMENTADO: Obtener tipos de práctica desde la tabla item con list_id = 'L_PRACTICE_TYPE'
    const [rows] = await pool.query(`
      SELECT id, value, description, status
      FROM item
      WHERE list_id = 'L_PRACTICE_TYPE' AND status = 'ACTIVE'
      ORDER BY value
    `);
    
    // Formatear la respuesta
    const formatted = rows.map(item => ({
      id: item.id,
      value: item.value,
      name: item.value, // Para compatibilidad con el frontend
      description: item.description
    }));
    
    res.json(formatted);
  } catch (error) {
    console.error('Error al obtener tipos de práctica:', error);
    res.status(500).json({ error: 'Error al obtener tipos de práctica', details: error.message });
  }
};

export const getTiposEncuesta = async (req, res) => {
  try {
    // Obtener tipos de encuesta desde la tabla item con list_id = 'L_TYPE_SURVEY'
    const [rows] = await pool.query(`
      SELECT id, value, description, status
      FROM item
      WHERE list_id = 'L_TYPE_SURVEY' AND status = 'ACTIVE'
      ORDER BY value
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener tipos de encuesta:', error);
    res.status(500).json({ error: 'Error al obtener tipos de encuesta' });
  }
};

export const getTiposEncuestaMonitoring = async (req, res) => {
  try {
    // Obtener tipos de encuesta de monitoría desde la tabla item con list_id = 'L_TYPE_MONITORING_SURVEY'
    const [rows] = await pool.query(`
      SELECT id, value, description, status
      FROM item
      WHERE list_id = 'L_TYPE_MONITORING_SURVEY' AND status = 'ACTIVE'
      ORDER BY value
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener tipos de encuesta de monitoría:', error);
    res.status(500).json({ error: 'Error al obtener tipos de encuesta de monitoría' });
  }
};

export const getCategoriasMonitoring = async (req, res) => {
  try {
    // Obtener categorías de monitoría desde la tabla item con list_id = 'L_MONITORING_TYPE'
    const [rows] = await pool.query(`
      SELECT id, value, description, status
      FROM item
      WHERE list_id = 'L_MONITORING_TYPE' AND status = 'ACTIVE'
      ORDER BY value
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener categorías de monitoría:', error);
    res.status(500).json({ error: 'Error al obtener categorías de monitoría' });
  }
};
