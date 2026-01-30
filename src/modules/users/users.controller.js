import pool from '../../config/mysql.js';

export const getEstudiantes = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM estudiantes');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener estudiantes:', error);
    res.status(500).json({ error: 'Error al obtener estudiantes' });
  }
};

export const getTutores = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tutores');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener tutores:', error);
    res.status(500).json({ error: 'Error al obtener tutores' });
  }
};

export const getCoordinadores = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM coordinadores');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener coordinadores:', error);
    res.status(500).json({ error: 'Error al obtener coordinadores' });
  }
};

export const getEstudianteById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM estudiantes WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener estudiante:', error);
    res.status(500).json({ error: 'Error al obtener estudiante' });
  }
};
