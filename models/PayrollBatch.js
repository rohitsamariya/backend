const mongoose = require('mongoose');

const payrollBatchSchema = new mongoose.Schema({
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    status: {
        type: String,
        enum: ['GENERATING', 'COMPLETED', 'FAILED'],
        default: 'GENERATING'
    },
    totalEmployeesProcessed: {
        type: Number,
        default: 0
    },
    totalPayout: {
        type: Number,
        default: 0
    },
    logs: [String] // Array of error/process logs for debugging
}, {
    timestamps: true
});

// Prevent Duplicate Payroll Batches for Same Branch/Month
payrollBatchSchema.index({ month: 1, year: 1, branch: 1 }, { unique: true });

module.exports = mongoose.model('PayrollBatch', payrollBatchSchema);
