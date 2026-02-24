const mongoose = require('mongoose');

const esiContributionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payrollCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollCycle' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    month: { type: Number, required: true },
    year: { type: Number, required: true },

    grossSalary: { type: Number, required: true },

    employeeContribution: { type: Number, required: true },   // 0.75% of Gross
    employerContribution: { type: Number, required: true },   // 3.25% of Gross
    totalContribution: { type: Number, required: true },

    isEligible: { type: Boolean, default: true },
    esiNumber: String
}, { timestamps: true });

esiContributionSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });
esiContributionSchema.index({ branch: 1, month: 1, year: 1 });

module.exports = mongoose.model('ESIContribution', esiContributionSchema);
