import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  type: { type: String, enum: ['link', 'text'], required: true },
  order: { type: Number, required: true, min: 0, max: 10000 },
  url: {
    type: String,
    maxlength: 2048,
    validate: {
      validator(value) {
        if (value === undefined) return true;
        try {
          const parsed = new URL(value);
          return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '';
        } catch {
          return false;
        }
      },
      message: 'Resource links must use HTTPS and must not contain credentials',
    },
  },
  body: { type: String, maxlength: 20000 },
}, { _id: true, strict: 'throw' });

const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  description: { type: String, maxlength: 5000, default: '' },
  order: { type: Number, required: true, min: 0, max: 10000 },
  resources: { type: [resourceSchema], default: [] },
}, { _id: true, strict: 'throw' });

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  description: { type: String, maxlength: 6000, default: '' },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    required: true,
    default: 'draft',
  },
  modules: { type: [moduleSchema], default: [] },
}, {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
});

courseSchema.index({ status: 1, createdAt: -1, _id: -1 });
courseSchema.index({ instructorId: 1, createdAt: -1, _id: -1 });
courseSchema.index({ createdAt: -1, _id: -1 });

export function createCourseModel(connection = mongoose) {
  return connection.models.Course ?? connection.model('Course', courseSchema);
}
