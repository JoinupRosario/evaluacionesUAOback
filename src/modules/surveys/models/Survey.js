import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['text', 'textarea', 'multiple_choice', 'checkbox', 'scale', 'date', 'number'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  required: {
    type: Boolean,
    default: false
  },
  // Para opciones (multiple_choice, checkbox)
  options: [{
    label: String,
    value: String
  }],
  // Para escala (scale)
  scale_min: {
    type: Number,
    default: 1
  },
  scale_max: {
    type: Number,
    default: 5
  },
  scale_labels: {
    min_label: String,
    max_label: String
  },
  // Para validaciones
  validation: {
    min_length: Number,
    max_length: Number,
    pattern: String
  },
  order: {
    type: Number,
    required: true
  }
}, { _id: true });

// Schema para un formulario individual (estudiante, tutor, monitor)
const formSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  questions: [questionSchema],
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
    default: 'DRAFT'
  },
  user_creator: {
    type: String,
    required: true
  },
  // ID en MySQL (tabla item)
  item_id_mysql: {
    type: Number,
    sparse: true
  },
  // Código numérico usado en value_for_reports (ej: 2001, 2002, 2003)
  item_code: {
    type: Number,
    sparse: true
  }
}, {
  timestamps: true,
  _id: true
});

// Schema principal que contiene los 3 formularios
const surveySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // Los 3 formularios: estudiante, tutor, monitor (pueden ser null si no tienen preguntas)
  student_form: {
    type: formSchema,
    required: false,
    default: null
  },
  tutor_form: {
    type: formSchema,
    required: false,
    default: null
  },
  monitor_form: {
    type: formSchema,
    required: false,
    default: null
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
    default: 'DRAFT'
  },
  user_creator: {
    type: String,
    required: true
  },
  user_updater: {
    type: String
  },
  // ID en MySQL (tabla item) - referencia principal
  survey_id_mysql: {
    type: Number,
    sparse: true
  },
  // Tipo de encuesta: 'PRACTICE' o 'MONITORING'
  survey_type: {
    type: String,
    enum: ['PRACTICE', 'MONITORING'],
    default: 'PRACTICE'
  }
}, {
  timestamps: true
});

// Índice para búsqueda
surveySchema.index({ name: 'text', description: 'text' });
surveySchema.index({ status: 1 });
surveySchema.index({ user_creator: 1 });

export default mongoose.model('Survey', surveySchema);
