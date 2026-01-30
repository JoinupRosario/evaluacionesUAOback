import Survey from './models/Survey.js';
import pool from '../../config/mysql.js';

export const createSurvey = async (req, res) => {
  try {
    const { name, description, student_questions, tutor_questions, monitor_questions, survey_type } = req.body;
    const user_creator = req.user?.email || req.user?.username || 'system';

    if (!name) {
      return res.status(400).json({ error: 'El nombre del formulario es requerido' });
    }

    // Validar que al menos un formulario tenga preguntas
    const hasQuestions = 
      (student_questions && student_questions.length > 0) ||
      (tutor_questions && tutor_questions.length > 0) ||
      (monitor_questions && monitor_questions.length > 0);

    if (!hasQuestions) {
      return res.status(400).json({ error: 'Debe agregar al menos una pregunta en alguno de los formularios' });
    }

    // Generar IDs manualmente para los subdocumentos
    const mongoose = (await import('mongoose')).default;

    // Procesar preguntas de estudiante
    const studentQuestionsWithOrder = (student_questions || []).map((q, index) => ({
      ...q,
      order: q.order !== undefined ? q.order : index + 1
    }));

    // Procesar preguntas de tutor
    const tutorQuestionsWithOrder = (tutor_questions || []).map((q, index) => ({
      ...q,
      order: q.order !== undefined ? q.order : index + 1
    }));

    // Procesar preguntas de monitor
    const monitorQuestionsWithOrder = (monitor_questions || []).map((q, index) => ({
      ...q,
      order: q.order !== undefined ? q.order : index + 1
    }));
    
    // Crear formularios solo si tienen preguntas
    const studentForm = studentQuestionsWithOrder.length > 0 ? {
      _id: new mongoose.Types.ObjectId(),
      name: `${name} - Estudiante`,
      description: description || '',
      questions: studentQuestionsWithOrder,
      status: 'ACTIVE',
      user_creator
    } : null;

    const tutorForm = tutorQuestionsWithOrder.length > 0 ? {
      _id: new mongoose.Types.ObjectId(),
      name: `${name} - Tutor`,
      description: description || '',
      questions: tutorQuestionsWithOrder,
      status: 'ACTIVE',
      user_creator
    } : null;

    const monitorForm = monitorQuestionsWithOrder.length > 0 ? {
      _id: new mongoose.Types.ObjectId(),
      name: `${name} - Monitor`,
      description: description || '',
      questions: monitorQuestionsWithOrder,
      status: 'ACTIVE',
      user_creator
    } : null;

    // Guardar en MongoDB
    const survey = new Survey({
      name,
      description: description || '',
      student_form: studentForm,
      tutor_form: tutorForm,
      monitor_form: monitorForm,
      status: 'ACTIVE', // Cambiar a ACTIVE cuando se crea
      user_creator,
      survey_type: survey_type || 'PRACTICE' // PRACTICE o MONITORING
    });

    await survey.save();

    // Guardar en MySQL (tabla item) - SOLO UN REGISTRO
    // Determinar el list_id según el tipo de encuesta
    const surveyType = survey_type || 'PRACTICE';
    let listId = surveyType === 'MONITORING' ? 'L_TYPE_MONITORING_SURVEY' : 'L_TYPE_SURVEY';
    const [listCheck] = await pool.query(
      'SELECT id FROM dynamic_list WHERE id = ?',
      [listId]
    );

    if (listCheck.length === 0) {
      // Si no existe, crearlo (dynamic_list tiene: id, name, type)
      const listName = surveyType === 'MONITORING' ? 'Tipos de Encuesta de Monitoría' : 'Tipos de Encuesta';
      await pool.query(
        'INSERT INTO dynamic_list (id, name, type) VALUES (?, ?, ?)',
        [listId, listName, 'SURVEY']
      );
    }

    // Generar números consecutivos empezando desde 2001
    // Buscar el último número usado en value_for_reports en TODA la tabla item
    // (sin filtrar por list_id para evitar códigos duplicados)
    const [allItems] = await pool.query(`
      SELECT value_for_reports 
      FROM item 
      WHERE value_for_reports IS NOT NULL AND value_for_reports != ''
      ORDER BY id DESC
    `);

    let nextNumber = 2001;
    let maxFound = 0;
    
    // Buscar el número más alto en todos los value_for_reports
    for (const item of allItems) {
      if (item.value_for_reports) {
        const matches = item.value_for_reports.match(/\d+/g);
        if (matches && matches.length > 0) {
          const numbers = matches.map(Number).filter(n => n >= 2000); // Solo números >= 2000
          if (numbers.length > 0) {
            const itemMax = Math.max(...numbers);
            if (itemMax > maxFound) {
              maxFound = itemMax;
            }
          }
        }
      }
    }
    
    if (maxFound >= 2000) {
      nextNumber = maxFound + 1;
    }

    // Asignar números consecutivos solo a formularios con preguntas
    // Si no tiene preguntas, usar código 0
    let currentNumber = nextNumber;
    let studentCode = 0;
    let tutorCode = 0;
    let monitorCode = 0;

    if (studentQuestionsWithOrder.length > 0) {
      studentCode = currentNumber++;
    }
    if (tutorQuestionsWithOrder.length > 0) {
      tutorCode = currentNumber++;
    }
    if (monitorQuestionsWithOrder.length > 0) {
      monitorCode = currentNumber++;
    }

    // Crear value_for_reports con números de 4 dígitos o 0
    // Formato: e:2001;t:0;m:0 (si solo estudiante tiene preguntas)
    // Formato: e:2001;t:2002;m:0 (si estudiante y tutor tienen preguntas)
    const valueForReports = `e:${studentCode};t:${tutorCode};m:${monitorCode}`;

    // Crear UN SOLO registro en item con value_for_reports
    const insertItemQuery = `
      INSERT INTO item (value, description, value_for_reports, status, list_id)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertItemQuery, [
      name,
      description || '',
      valueForReports,
      'ACTIVE',
      listId
    ]);

    const itemId = result.insertId;

    // Actualizar los formularios en MongoDB con los códigos numéricos (solo si existen)
    if (survey.student_form) {
      survey.student_form.item_code = studentCode;
    }
    if (survey.tutor_form) {
      survey.tutor_form.item_code = tutorCode;
    }
    if (survey.monitor_form) {
      survey.monitor_form.item_code = monitorCode;
    }
    survey.survey_id_mysql = itemId;
    await survey.save();

    res.status(201).json({
      message: 'Formulario creado exitosamente con 3 variantes (Estudiante, Tutor, Monitor)',
      survey: {
        id: survey._id,
        name: survey.name,
        description: survey.description,
        survey_id_mysql: itemId,
        student_form: survey.student_form ? {
          id: survey.student_form._id.toString(),
          item_code: studentCode,
          questions_count: studentQuestionsWithOrder.length
        } : { item_code: 0, questions_count: 0 },
        tutor_form: survey.tutor_form ? {
          id: survey.tutor_form._id.toString(),
          item_code: tutorCode,
          questions_count: tutorQuestionsWithOrder.length
        } : { item_code: 0, questions_count: 0 },
        monitor_form: survey.monitor_form ? {
          id: survey.monitor_form._id.toString(),
          item_code: monitorCode,
          questions_count: monitorQuestionsWithOrder.length
        } : { item_code: 0, questions_count: 0 },
        value_for_reports: valueForReports,
        status: survey.status
      }
    });
  } catch (error) {
    console.error('Error al crear formulario:', error);
    res.status(500).json({ error: 'Error al crear formulario', details: error.message });
  }
};

export const getSurveys = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    const surveys = await Survey.find(query)
      .select('name description student_form tutor_form monitor_form status survey_type survey_id_mysql createdAt updatedAt')
      .sort({ createdAt: -1 });

    const surveysWithCount = surveys.map(survey => {
      const totalQuestions = 
        (survey.student_form?.questions?.length || 0) +
        (survey.tutor_form?.questions?.length || 0) +
        (survey.monitor_form?.questions?.length || 0);

      return {
        id: survey._id,
        name: survey.name,
        description: survey.description,
        questions_count: totalQuestions,
        student_questions: survey.student_form?.questions?.length || 0,
        tutor_questions: survey.tutor_form?.questions?.length || 0,
        monitor_questions: survey.monitor_form?.questions?.length || 0,
        survey_id_mysql: survey.survey_id_mysql,
        status: survey.status,
        survey_type: survey.survey_type || 'PRACTICE',
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt
      };
    });

    res.json(surveysWithCount);
  } catch (error) {
    console.error('Error al obtener formularios:', error);
    res.status(500).json({ error: 'Error al obtener formularios' });
  }
};

export const getSurveyById = async (req, res) => {
  try {
    const { id } = req.params;

    const survey = await Survey.findById(id);

    if (!survey) {
      return res.status(404).json({ error: 'Formulario no encontrado' });
    }

    res.json({
      id: survey._id,
      name: survey.name,
      description: survey.description,
      student_form: survey.student_form,
      tutor_form: survey.tutor_form,
      monitor_form: survey.monitor_form,
      survey_id_mysql: survey.survey_id_mysql,
      status: survey.status,
      survey_type: survey.survey_type,
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt
    });
  } catch (error) {
    console.error('Error al obtener formulario:', error);
    res.status(500).json({ error: 'Error al obtener formulario' });
  }
};

export const updateSurvey = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, student_questions, tutor_questions, monitor_questions, status, survey_type } = req.body;
    const user_updater = req.user?.email || req.user?.username || 'system';

    const survey = await Survey.findById(id);

    if (!survey) {
      return res.status(404).json({ error: 'Formulario no encontrado' });
    }

    // Actualizar nombre y descripción (compartidos)
    if (name) survey.name = name;
    if (description !== undefined) survey.description = description;
    if (status) survey.status = status;
    if (survey_type) survey.survey_type = survey_type;

    // Actualizar preguntas de cada formulario
    const mongoose = (await import('mongoose')).default;

    if (student_questions !== undefined) {
      if (Array.isArray(student_questions) && student_questions.length > 0) {
        const questionsWithOrder = student_questions.map((q, index) => ({
          ...q,
          order: q.order !== undefined ? q.order : index + 1
        }));
        if (!survey.student_form) {
          survey.student_form = {
            _id: new mongoose.Types.ObjectId(),
            name: `${survey.name} - Estudiante`,
            description: survey.description || '',
            questions: questionsWithOrder,
            status: 'ACTIVE',
            user_creator: user_updater
          };
        } else {
          survey.student_form.questions = questionsWithOrder;
          survey.student_form.status = 'ACTIVE';
        }
      } else {
        // Si no hay preguntas, eliminar el formulario
        survey.student_form = null;
      }
    }

    if (tutor_questions !== undefined) {
      if (Array.isArray(tutor_questions) && tutor_questions.length > 0) {
        const questionsWithOrder = tutor_questions.map((q, index) => ({
          ...q,
          order: q.order !== undefined ? q.order : index + 1
        }));
        const wasTutorFormEmpty = !survey.tutor_form || !survey.tutor_form.questions || survey.tutor_form.questions.length === 0;
        if (!survey.tutor_form) {
          survey.tutor_form = {
            _id: new mongoose.Types.ObjectId(),
            name: `${survey.name} - Tutor`,
            description: survey.description || '',
            questions: questionsWithOrder,
            status: 'ACTIVE',
            user_creator: user_updater
          };
        } else {
          survey.tutor_form.questions = questionsWithOrder;
          survey.tutor_form.status = 'ACTIVE';
        }
        // Si el formulario no tenía item_code y ahora tiene preguntas, se asignará después
      } else {
        // Si no hay preguntas, eliminar el formulario
        survey.tutor_form = null;
      }
    }

    if (monitor_questions !== undefined) {
      if (Array.isArray(monitor_questions) && monitor_questions.length > 0) {
        const questionsWithOrder = monitor_questions.map((q, index) => ({
          ...q,
          order: q.order !== undefined ? q.order : index + 1
        }));
        if (!survey.monitor_form) {
          survey.monitor_form = {
            _id: new mongoose.Types.ObjectId(),
            name: `${survey.name} - Monitor`,
            description: survey.description || '',
            questions: questionsWithOrder,
            status: 'ACTIVE',
            user_creator: user_updater
          };
        } else {
          survey.monitor_form.questions = questionsWithOrder;
          survey.monitor_form.status = 'ACTIVE';
        }
      } else {
        // Si no hay preguntas, eliminar el formulario
        survey.monitor_form = null;
      }
    }

    // Actualizar user_updater antes de guardar
    survey.user_updater = user_updater;

    // Asignar item_code a formularios que no lo tienen pero ahora tienen preguntas
    // Necesitamos generar nuevos códigos si un formulario pasa de no tener preguntas a tenerlas
    // Determinar el list_id según el tipo de encuesta
    const surveyType = survey.survey_type || 'PRACTICE';
    const listId = surveyType === 'MONITORING' ? 'L_TYPE_MONITORING_SURVEY' : 'L_TYPE_SURVEY';
    
    // Verificar si necesitamos generar nuevos códigos
    let needsNewCodes = false;
    if (survey.student_form && (!survey.student_form.item_code || survey.student_form.item_code === 0) && survey.student_form.questions && survey.student_form.questions.length > 0) {
      needsNewCodes = true;
    }
    if (survey.tutor_form && (!survey.tutor_form.item_code || survey.tutor_form.item_code === 0) && survey.tutor_form.questions && survey.tutor_form.questions.length > 0) {
      needsNewCodes = true;
    }
    if (survey.monitor_form && (!survey.monitor_form.item_code || survey.monitor_form.item_code === 0) && survey.monitor_form.questions && survey.monitor_form.questions.length > 0) {
      needsNewCodes = true;
    }

    // Si necesitamos generar nuevos códigos, buscar el siguiente número disponible
    // Buscar en TODA la tabla item (sin filtrar por list_id para evitar duplicados)
    if (needsNewCodes) {
      const [allItems] = await pool.query(`
        SELECT value_for_reports 
        FROM item 
        WHERE value_for_reports IS NOT NULL AND value_for_reports != ''
        ORDER BY id DESC
      `);

      let nextNumber = 2001;
      let maxFound = 0;
      
      // Buscar el número más alto en todos los value_for_reports
      for (const item of allItems) {
        if (item.value_for_reports) {
          const matches = item.value_for_reports.match(/\d+/g);
          if (matches && matches.length > 0) {
            const numbers = matches.map(Number).filter(n => n >= 2000); // Solo números >= 2000
            if (numbers.length > 0) {
              const itemMax = Math.max(...numbers);
              if (itemMax > maxFound) {
                maxFound = itemMax;
              }
            }
          }
        }
      }
      
      if (maxFound >= 2000) {
        nextNumber = maxFound + 1;
      }

      // Obtener los códigos existentes (mantener los que ya tienen)
      let studentCode = (survey.student_form?.item_code && survey.student_form.item_code !== 0) ? survey.student_form.item_code : 0;
      let tutorCode = (survey.tutor_form?.item_code && survey.tutor_form.item_code !== 0) ? survey.tutor_form.item_code : 0;
      let monitorCode = (survey.monitor_form?.item_code && survey.monitor_form.item_code !== 0) ? survey.monitor_form.item_code : 0;

      // Asignar nuevos códigos solo a formularios que no lo tienen pero tienen preguntas
      if (survey.student_form && (!survey.student_form.item_code || survey.student_form.item_code === 0) && survey.student_form.questions && survey.student_form.questions.length > 0) {
        studentCode = nextNumber++;
        survey.student_form.item_code = studentCode;
        console.log(`✅ Asignado item_code ${studentCode} a student_form`);
      }
      if (survey.tutor_form && (!survey.tutor_form.item_code || survey.tutor_form.item_code === 0) && survey.tutor_form.questions && survey.tutor_form.questions.length > 0) {
        tutorCode = nextNumber++;
        survey.tutor_form.item_code = tutorCode;
        console.log(`✅ Asignado item_code ${tutorCode} a tutor_form`);
      }
      if (survey.monitor_form && (!survey.monitor_form.item_code || survey.monitor_form.item_code === 0) && survey.monitor_form.questions && survey.monitor_form.questions.length > 0) {
        monitorCode = nextNumber++;
        survey.monitor_form.item_code = monitorCode;
        console.log(`✅ Asignado item_code ${monitorCode} a monitor_form`);
      }
    }

    await survey.save();

    // Actualizar value_for_reports en MySQL si existe survey_id_mysql
    if (survey.survey_id_mysql) {
      const studentCode = survey.student_form?.item_code || 0;
      const tutorCode = survey.tutor_form?.item_code || 0;
      const monitorCode = survey.monitor_form?.item_code || 0;
      const valueForReports = `e:${studentCode};t:${tutorCode};m:${monitorCode}`;

      console.log(`📝 Actualizando value_for_reports en MySQL: ${valueForReports} para item.id = ${survey.survey_id_mysql}`);
      
      await pool.query(
        'UPDATE item SET value_for_reports = ? WHERE id = ?',
        [valueForReports, survey.survey_id_mysql]
      );

      console.log(`✅ value_for_reports actualizado en MySQL`);
    }

    res.json({
      message: 'Formulario actualizado exitosamente',
      survey: {
        id: survey._id,
        name: survey.name,
        description: survey.description,
        student_form: survey.student_form,
        tutor_form: survey.tutor_form,
        monitor_form: survey.monitor_form,
        status: survey.status
      }
    });
  } catch (error) {
    console.error('Error al actualizar formulario:', error);
    res.status(500).json({ error: 'Error al actualizar formulario' });
  }
};

export const deleteSurvey = async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar el formulario antes de eliminarlo para obtener survey_id_mysql
    const survey = await Survey.findById(id);

    if (!survey) {
      return res.status(404).json({ error: 'Formulario no encontrado' });
    }

    // Eliminar de MongoDB
    await Survey.findByIdAndDelete(id);

    // Eliminar también de MySQL (tabla item) si existe survey_id_mysql
    if (survey.survey_id_mysql) {
      try {
        await pool.query('DELETE FROM item WHERE id = ?', [survey.survey_id_mysql]);
        console.log(`✅ Registro eliminado de MySQL (item.id = ${survey.survey_id_mysql})`);
      } catch (mysqlError) {
        console.warn(`⚠️  No se pudo eliminar de MySQL: ${mysqlError.message}`);
        // No fallar si no se puede eliminar de MySQL, solo advertir
      }
    }

    res.json({ message: 'Formulario eliminado exitosamente de MongoDB y MySQL' });
  } catch (error) {
    console.error('Error al eliminar formulario:', error);
    res.status(500).json({ error: 'Error al eliminar formulario' });
  }
};
