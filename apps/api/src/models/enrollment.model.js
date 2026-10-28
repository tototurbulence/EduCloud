import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema({
  learnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  status: {
    type: String,
    enum: ['active'],
    required: true,
    default: 'active',
  },
  completedModuleIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId }],
    default: [],
  },
}, {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
});

enrollmentSchema.index({ learnerId: 1, courseId: 1 }, { unique: true });
enrollmentSchema.index({ courseId: 1, status: 1, createdAt: -1, _id: -1 });
enrollmentSchema.index({ learnerId: 1, createdAt: -1, _id: -1 });

export function createEnrollmentModel(connection = mongoose) {
  return connection.models.Enrollment ?? connection.model('Enrollment', enrollmentSchema);
}
