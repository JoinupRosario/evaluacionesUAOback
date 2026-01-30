import mongoose from 'mongoose';

const evaluationSchema = new mongoose.Schema({
  // ID de referencia a MySQL (opcional, solo para referencia histórica)
  evaluation_id_mysql: {
    type: Number,
    unique: false,
    required: false
  },
  
  // Campos principales
  name: {
    type: String,
    required: true
  },
  period: {
    type: Number,
    required: true
  },
  type_survey: {
    type: mongoose.Schema.Types.Mixed, // Puede ser ObjectId (Survey de MongoDB) o Number (ID de MySQL item.id)
    ref: 'Survey'
  },
  evaluation_type: {
    type: String,
    enum: ['PRACTICE', 'MONITORING'],
    default: 'PRACTICE'
  },
  practice_type: {
    type: Number
  },
  faculty_id: {
    type: Number
  },
  
  // IDs de encuestas para cada actor (med_enc_id_*)
  med_enc_id_student: {
    type: Number
  },
  med_enc_id_boss: {
    type: Number
  },
  med_enc_id_monitor: {
    type: Number
  },
  // IDs de encuestas para Monitorías
  med_enc_id_teacher: {
    type: Number
  },
  med_enc_id_coord: {
    type: Number
  },
  
  // Totales y porcentajes (para Prácticas)
  total_bosses: {
    type: Number,
    default: 0
  },
  total_students: {
    type: Number,
    default: 0
  },
  total_monitors: {
    type: Number,
    default: 0
  },
  percentage_bosses: {
    type: Number,
    default: 0
  },
  percentage_students: {
    type: Number,
    default: 0
  },
  percentage_monitors: {
    type: Number,
    default: 0
  },
  // Totales y porcentajes (para Monitorías)
  total_teachers: {
    type: Number,
    default: 0
  },
  total_coordinators: {
    type: Number,
    default: 0
  },
  percentage_teachers: {
    type: Number,
    default: 0
  },
  percentage_coords: {
    type: Number,
    default: 0
  },
  
  // Fechas
  start_date: {
    type: Date,
    required: true
  },
  finish_date: {
    type: Date,
    required: true
  },
  date_sent: {
    type: Date
  },
  
  // Alertas
  alert_value: {
    type: Number,
    default: 0
  },
  alert_unit: {
    type: String, // 'DAYS', 'WEEKS', 'MONTHS'
    enum: ['DAYS', 'WEEKS', 'MONTHS']
  },
  alert_when: {
    type: String, // 'AFTER_START_PRACTICE', 'BEFORE_END_PRACTICE'
    enum: ['AFTER_START_PRACTICE', 'BEFORE_END_PRACTICE']
  },
  
  // Programas asociados (array de program_faculty_id)
  program_faculty_ids: [{
    type: Number
  }],
  
  // Estado y control
  status: {
    type: String,
    default: 'CREATED',
    enum: ['CREATED', 'SENT', 'FINALIZED', 'CANCELLED']
  },
  email_status: {
    type: String,
    default: 'NOT_SENT',
    enum: ['NOT_SENT', 'SENT', 'FAILED']
  },
  user_creator: {
    type: String,
    required: true
  },
  user_updater: {
    type: String
  },
  
  // Referencia al formato de encuesta (se creará después)
  survey_format_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurveyFormat'
  },
  
  // Correos de actores asociados a cada legalización (solo en MongoDB)
  student_emails: [{
    legalization_id: {
      type: Number,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  }],
  boss_emails: [{
    legalization_id: {
      type: Number,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  }],
  monitor_emails: [{
    legalization_id: {
      type: Number,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    monitor_type: {
      type: String,
      enum: ['user_tutor', 'user_tutor_2'],
      required: true
    }
  }],
  // Correos de actores para Monitorías
  teacher_emails: [{
    legalization_id: {
      type: Number,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  }],
  coordinator_emails: [{
    legalization_id: {
      type: Number,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  }]
}, {
  timestamps: true
});

export default mongoose.model('Evaluation', evaluationSchema);
