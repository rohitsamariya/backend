const mongoose = require('mongoose');

const pfContributionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payrollCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollCycle' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    month: { type: Number, required: true },
    year: { type: Number, required: true },

    // Wage Base
    basicPlusDa: { type: Number, required: true },

    // Employee Contribution
    employeePF: { type: Number, required: true },           // 12% of Basic+DA

    // Employer Contribution (split)
    employerEPS: { type: Number, required: true },          // 8.33% of Basic+DA (capped at ₹15,000)
    employerEPF: { type: Number, required: true },          // 3.67% of Basic+DA
    employerTotal: { type: Number, required: true },        // employerEPS + employerEPF = 12%

    // Total
    totalContribution: { type: Number, required: true },    // Employee + Employer

    // ECR Fields
    uanNumber: String,
    pfAccountNumber: String,
    memberName: String,

    // Admin Charges (for employer — informational)
    adminCharges: { type: Number, default: 0 },             // 0.5% admin + 0.5% EDLI

    isVoluntary: { type: Boolean, default: false }           // If Basic+DA > ₹15,000 and opted in
}, { timestamps: true });

pfContributionSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });
pfContributionSchema.index({ branch: 1, month: 1, year: 1 });

module.exports = mongoose.model('PFContribution', pfContributionSchema);
