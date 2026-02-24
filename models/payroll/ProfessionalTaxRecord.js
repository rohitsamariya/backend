const mongoose = require('mongoose');

const professionalTaxRecordSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payrollCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollCycle' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    month: { type: Number, required: true },
    year: { type: Number, required: true },

    state: { type: String, required: true },
    grossSalary: { type: Number, required: true },
    ptAmount: { type: Number, required: true },

    isFebruary: { type: Boolean, default: false }  // Some states charge differently in Feb
}, { timestamps: true });

professionalTaxRecordSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('ProfessionalTaxRecord', professionalTaxRecordSchema);
