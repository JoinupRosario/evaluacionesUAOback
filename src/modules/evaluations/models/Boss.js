import mongoose from 'mongoose';

const bossSchema = new mongoose.Schema({
  boss_id_mysql: {
    type: Number,
    required: true,
    unique: true
  },
  first_name: {
    type: String,
    required: true
  },
  last_name: {
    type: String,
    required: true
  },
  identification_type: {
    type: Number
  },
  identification: {
    type: String
  },
  job: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone_number: {
    type: String,
    required: true
  },
  phone_extension: {
    type: String
  }
}, {
  timestamps: true
});

export default mongoose.model('Boss', bossSchema);
