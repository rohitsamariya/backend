const mongoose = require('mongoose');

const investmentDeclarationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    financialYear: { type: String, required: true, default: '2025-26' },

    // Section 80C (Max ₹1,50,000)
    section80C: {
        ppf: { type: Number, default: 0 },
        elss: { type: Number, default: 0 },
        lifeInsurance: { type: Number, default: 0 },
        nsc: { type: Number, default: 0 },
        homeLoanPrincipal: { type: Number, default: 0 },
        childrenTuition: { type: Number, default: 0 },
        fiveYearFD: { type: Number, default: 0 },
        sukanyaSamriddhi: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
        total: { type: Number, default: 0 }  // Capped at ₹1,50,000
    },

    // Section 80D (Medical Insurance)
    section80D: {
        selfAndFamily: { type: Number, default: 0 },       // Max ₹25,000
        parents: { type: Number, default: 0 },             // Max ₹25,000 (₹50,000 if senior)
        preventiveHealthCheck: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    },

    // HRA Exemption
    hraExemption: {
        rentPaid: { type: Number, default: 0 },
        isMetro: { type: Boolean, default: false },        // Metro = 50% of Basic, Non-metro = 40%
        calculatedExemption: { type: Number, default: 0 }
    },

    // Section 80E (Education Loan Interest)
    section80E: { type: Number, default: 0 },

    // Section 80G (Donations)
    section80G: { type: Number, default: 0 },

    // Section 24B (Home Loan Interest — max ₹2,00,000)
    section24B: { type: Number, default: 0 },

    // NPS — Section 80CCD(1B) (Additional ₹50,000)
    section80CCD1B: { type: Number, default: 0 },

    // Total Declared Exemptions
    totalDeclaredExemptions: { type: Number, default: 0 },

    status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'VERIFIED', 'LOCKED'], default: 'DRAFT' },
    submittedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

investmentDeclarationSchema.index({ user: 1, financialYear: 1 }, { unique: true });

module.exports = mongoose.model('InvestmentDeclaration', investmentDeclarationSchema);
