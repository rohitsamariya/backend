const mongoose = require('mongoose');

const branchPayrollRunSchema = new mongoose.Schema({
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
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
    status: {
        type: String,
        enum: ['RUNNING', 'COMPLETED', 'FAILED'],
        default: 'RUNNING'
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date,
    totalEmployees: {
        type: Number,
        default: 0
    },
    processedCount: {
        type: Number,
        default: 0
    },
    failedCount: {
        type: Number,
        default: 0
    },
    runBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    payrollRunId: {
        type: String,
        required: true
    }
}, { timestamps: true });

branchPayrollRunSchema.index({ branch: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('BranchPayrollRun', branchPayrollRunSchema);
