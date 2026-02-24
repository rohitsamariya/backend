/**
 * TDS Service — Income Tax Section 192
 * 
 * Annualized salary-based TDS calculation.
 * Supports Old & New regime with configurable slabs.
 * 
 * FIX: Uses projected annual income (YTD actual + remaining projected)
 * instead of simple grossSalary × 12.
 * 
 * New Regime FY 2025-26:
 *   0 - 3L       → 0%
 *   3L - 7L      → 5%
 *   7L - 10L     → 10%
 *   10L - 12L    → 15%
 *   12L - 15L    → 20%
 *   15L+         → 30%
 * 
 * Old Regime:
 *   0 - 2.5L     → 0%
 *   2.5L - 5L    → 5%
 *   5L - 10L     → 20%
 *   10L+         → 30%
 */

const mongoose = require('mongoose');
const TaxSlab = require('../../models/payroll/TaxSlab');
const PayrollSummary = require('../../models/PayrollSummary');
const TDSRecord = require('../../models/payroll/TDSRecord');
const SalaryStructure = require('../../models/payroll/SalaryStructure');
const InvestmentDeclaration = require('../../models/payroll/InvestmentDeclaration');

// Default slabs (used if DB not seeded)
const DEFAULT_NEW_SLABS = [
    { from: 0, to: 300000, rate: 0 },
    { from: 300000, to: 700000, rate: 5 },
    { from: 700000, to: 1000000, rate: 10 },
    { from: 1000000, to: 1200000, rate: 15 },
    { from: 1200000, to: 1500000, rate: 20 },
    { from: 1500000, to: null, rate: 30 }
];

const DEFAULT_OLD_SLABS = [
    { from: 0, to: 250000, rate: 0 },
    { from: 250000, to: 500000, rate: 5 },
    { from: 500000, to: 1000000, rate: 20 },
    { from: 1000000, to: null, rate: 30 }
];

const FALLBACK = {
    standardDeductionNew: 75000,
    standardDeductionOld: 50000,
    cessRate: 4,
    section87aLimitNew: 700000,
    section87aLimitOld: 500000
};

/**
 * Get tax slabs from DB or use defaults
 */
async function getSlabs(regime, financialYear = '2025-26') {
    try {
        const dbSlab = await TaxSlab.findOne({ regime, financialYear, isActive: true });
        if (dbSlab && dbSlab.slabs.length > 0) return dbSlab.slabs;
    } catch (e) { /* fallback to defaults */ }
    return regime === 'NEW' ? DEFAULT_NEW_SLABS : DEFAULT_OLD_SLABS;
}

/**
 * Calculate tax from slabs
 */
function calculateFromSlabs(taxableIncome, slabs) {
    let tax = 0;
    for (const slab of slabs) {
        if (taxableIncome <= slab.from) break;
        const upper = slab.to ? Math.min(taxableIncome, slab.to) : taxableIncome;
        const taxableInSlab = upper - slab.from;
        if (taxableInSlab > 0) {
            tax += taxableInSlab * (slab.rate / 100);
        }
    }
    return Math.round(tax);
}

/**
 * Calculate annual TDS (core slab-based calculation)
 */
async function calculateAnnualTax({ annualGross, regime = 'NEW', declarations = {}, financialYear = '2025-26', config = {} }) {
    const slabs = await getSlabs(regime, financialYear);

    const standardDeduction = regime === 'NEW'
        ? (config.standardDeductionNew || FALLBACK.standardDeductionNew)
        : (config.standardDeductionOld || FALLBACK.standardDeductionOld);

    // Exemptions (Old Regime only)
    let section80C = 0, section80D = 0, hraExemption = 0, otherExemptions = 0;
    if (regime === 'OLD') {
        section80C = Math.min(declarations.section80C || 0, 150000);
        section80D = Math.min(declarations.section80D || 0, 75000);
        hraExemption = declarations.hraExemption || 0;
        otherExemptions = (declarations.section80E || 0)
            + Math.min(declarations.section24B || 0, 200000)
            + Math.min(declarations.section80CCD1B || 0, 50000)
            + (declarations.section80G || 0);
    }

    const totalExemptions = standardDeduction + section80C + section80D + hraExemption + otherExemptions;
    const taxableIncome = Math.max(0, annualGross - totalExemptions);

    // Tax from slabs
    let taxBeforeCess = calculateFromSlabs(taxableIncome, slabs);

    // Section 87A Rebate
    const rebateLimitNew = config.section87aLimitNew || FALLBACK.section87aLimitNew;
    const rebateLimitOld = config.section87aLimitOld || FALLBACK.section87aLimitOld;
    const rebateLimit = regime === 'NEW' ? rebateLimitNew : rebateLimitOld;
    if (taxableIncome <= rebateLimit) {
        taxBeforeCess = 0;
    }

    // Surcharge
    let surcharge = 0;
    if (taxableIncome > 50000000) surcharge = taxBeforeCess * 0.37;
    else if (taxableIncome > 20000000) surcharge = taxBeforeCess * 0.25;
    else if (taxableIncome > 10000000) surcharge = taxBeforeCess * 0.15;
    else if (taxableIncome > 5000000) surcharge = taxBeforeCess * 0.10;
    surcharge = Math.round(surcharge);

    // Cess
    const cessRate = (config.cessRate || FALLBACK.cessRate) / 100;
    const cess = Math.round((taxBeforeCess + surcharge) * cessRate);
    const totalTax = taxBeforeCess + surcharge + cess;

    return {
        annualGross,
        regime,
        standardDeduction,
        section80C, section80D, hraExemption, otherExemptions,
        totalExemptions,
        taxableIncome,
        annualTaxBeforeCess: taxBeforeCess,
        surcharge, cess,
        totalAnnualTax: totalTax
    };
}

/**
 * Compute monthly TDS
 */
function computeMonthlyTDS(totalAnnualTax, tdsPaidYTD = 0, remainingMonths = 12) {
    if (remainingMonths <= 0) return 0;
    const remaining = Math.max(0, totalAnnualTax - tdsPaidYTD);
    return Math.max(0, Math.round(remaining / remainingMonths));
}

/**
 * Get remaining months in financial year (FY: April to March)
 */
function getRemainingMonths(month, year) {
    if (month >= 4) return Math.max(1, 16 - month);
    return Math.max(1, 4 - month);
}

/**
 * Get financial year string
 */
function getFinancialYear(month, year) {
    if (month >= 4) return `${year}-${(year + 1).toString().slice(-2)}`;
    return `${year - 1}-${year.toString().slice(-2)}`;
}

/**
 * Get FY months that have already passed (for YTD calculation)
 * Returns array of { month, year } from April to (processing month - 1)
 */
function getFYMonthsUpTo(month, year) {
    const months = [];
    let startMonth, startYear;

    if (month >= 4) {
        startMonth = 4;
        startYear = year;
    } else {
        startMonth = 4;
        startYear = year - 1;
    }

    let m = startMonth, y = startYear;
    while (!(m === month && y === year)) {
        months.push({ month: m, year: y });
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return months;
}

/**
 * FIXED: Calculate Projected Annual Tax for an employee
 * 
 * Uses ACTUAL YTD gross from PayrollSummary + PROJECTED remaining months
 * instead of naive grossSalary × 12.
 * 
 * Handles: mid-year joins, salary revisions, arrears months.
 * 
 * @param {string} userId
 * @param {number} month - Current processing month
 * @param {number} year - Current processing year
 * @param {number} currentMonthGross - Gross for the month being processed
 * @param {object} salaryStructure - Active salary structure
 * @param {object} config - StatutoryConfig
 * @param {object} session - MongoDB session (optional)
 * @returns {object} { annualGross, monthlyTDS, tdsCalc, tdsPaidYTD, remainingMonths }
 */
async function calculateProjectedAnnualTax(userId, month, year, currentMonthGross, salaryStructure, config = {}, session = null) {
    const fy = getFinancialYear(month, year);
    const remainingMonths = getRemainingMonths(month, year);
    const regime = salaryStructure.taxRegime || config.defaultRegime || 'NEW';

    const sessionOpts = session ? { session } : {};

    // 1. Get YTD actual gross from PayrollSummary (FY months before current)
    const fyMonths = getFYMonthsUpTo(month, year);

    let ytdActualGross = 0;
    if (fyMonths.length > 0) {
        const orConditions = fyMonths.map(m => ({ month: m.month, year: m.year }));
        const ytdResult = await PayrollSummary.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), $or: orConditions } },
            { $group: { _id: null, totalGross: { $sum: '$grossSalary' } } }
        ]);
        ytdActualGross = ytdResult[0]?.totalGross || 0;
    }

    // 2. Project remaining months (including current) using current salary structure
    const projectedGross = currentMonthGross + (salaryStructure.grossSalary * (remainingMonths - 1));

    // 3. Total annual gross = YTD actual + projected remaining
    const annualGross = ytdActualGross + projectedGross;

    // 4. Load investment declarations for old regime
    let declarations = {};
    if (regime === 'OLD') {
        const decl = await InvestmentDeclaration.findOne({ user: userId, financialYear: fy }, null, sessionOpts);
        if (decl) {
            declarations = {
                section80C: decl.section80C?.total || 0,
                section80D: decl.section80D?.total || 0,
                hraExemption: decl.hraExemption?.calculatedExemption || 0,
                section80E: decl.section80E || 0,
                section24B: decl.section24B || 0,
                section80CCD1B: decl.section80CCD1B || 0,
                section80G: decl.section80G || 0
            };
        }
    }

    // 5. Calculate annual tax
    const tdsCalc = await calculateAnnualTax({ annualGross, regime, declarations, financialYear: fy, config });

    // 6. Get YTD TDS already paid
    const ytdTds = await TDSRecord.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), financialYear: fy } },
        { $group: { _id: null, total: { $sum: '$monthlyTDS' } } }
    ]);
    const tdsPaidYTD = ytdTds[0]?.total || 0;

    // 7. Compute monthly TDS for remaining period
    const monthlyTDS = computeMonthlyTDS(tdsCalc.totalAnnualTax, tdsPaidYTD, remainingMonths);

    return {
        annualGross,
        ytdActualGross,
        projectedGross,
        monthlyTDS,
        tdsCalc,
        tdsPaidYTD,
        remainingMonths,
        regime,
        financialYear: fy,
        declarations
    };
}

module.exports = {
    calculateAnnualTax,
    calculateProjectedAnnualTax,
    computeMonthlyTDS,
    getRemainingMonths,
    getFinancialYear,
    getFYMonthsUpTo,
    calculateFromSlabs,
    FALLBACK
};
