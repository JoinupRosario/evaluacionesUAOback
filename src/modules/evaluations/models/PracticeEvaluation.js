import mongoose from 'mongoose';

const practiceEvaluationSchema = new mongoose.Schema({
  academic_practice_legalized_id: {
    type: Number,
    required: true
  },
  evaluation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluation',
    required: true
  },
  
  // IDs de medición para cada actor (med_*_id)
  med_boss_id: {
    type: Number
  },
  med_student_id: {
    type: Number
  },
  med_monitor_id: {
    type: Number
  },
  
  // Estados de cada actor (med_*_status)
  med_boss_status: {
    type: String,
    default: null
  },
  med_student_status: {
    type: String,
    default: null
  },
  med_monitor_status: {
    type: String,
    default: null
  },
  
  // Datos de respuestas de cada actor (med_*_data)
  med_boss_data: {
    type: String // JSON string con las respuestas
  },
  med_student_data: {
    type: String // JSON string con las respuestas
  },
  med_monitor_data: {
    type: String // JSON string con las respuestas
  },
  
  // Fechas de envío
  last_date_send_boss: {
    type: Date
  },
  last_date_send_student: {
    type: Date
  },
  last_date_send_monitor: {
    type: Date
  },
  
  // Fechas de respuesta
  last_date_answer_boss: {
    type: Date
  },
  last_date_answer_student: {
    type: Date
  },
  last_date_answer_monitor: {
    type: Date
  },
  
  user_creator: {
    type: String,
    default: 'superadmin'
  },
  user_updater: {
    type: String
  }
}, {
  timestamps: true
});

// Índice compuesto para búsquedas rápidas
practiceEvaluationSchema.index({ academic_practice_legalized_id: 1, evaluation_id: 1 });

export default mongoose.model('PracticeEvaluation', practiceEvaluationSchema);
