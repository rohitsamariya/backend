/**
 * ESI Service — ESIC Compliance
 * 
 * Rules:
 * - Applicable if Gross Salary ≤ ₹21,000/month
 * - Employee Contribution = 0.75% of Gross
 * - Employer Contribution = 3.25% of Gross
 * 
 * CRITICAL: ESI follows 6-month contribution periods:
 *   Period 1: April – September
 *   Period 2: October – March
 * Eligibility is LOCKED at the start of each period.
 * Once eligible in a period, stays eligible for entire period even if salary crosses ceiling.
 * 
 * Config-driven via ConfigLoader.
 */

const ESIContributionPeriod = require('../../models/payroll/ESIContributionPeriod');

const FALLBACK = {
    esiEmployeeRate: 0.75,
    esiEmployerRate: 3.25,
    esiWageCeiling: 21000
};

/**
 * Determine ESI contribution period boundaries for a given month/year
 * @returns {{ periodStart: Date, periodEnd: Date, periodLabel: string }}
 */
function getContributionPeriod(month, year) {
    if (month >= 4 && month <= 9) {
        // Apr–Sep period
        return {
            periodStart: new Date(year, 3, 1),      // April 1
            periodEnd: new Date(year, 8, 30),        // September 30
            periodLabel: `Apr${year}-Sep${year}`
        };
    } else {
        // Oct–Mar period
        const octYear = month >= 10 ? year : year - 1;
        return {
            periodStart: new Date(octYear, 9, 1),    // October 1
            periodEnd: new Date(octYear + 1, 2, 31), // March 31
            periodLabel: `Oct${octYear}-Mar${octYear + 1}`
        };
    }
}

/**
 * Simple eligibility check (monthly, no period locking)
 * Kept for backward compatibility and standalone use
 */
function isEligible(grossSalary, config = {}) {
    const ceiling = config.esiWageCeiling || FALLBACK.esiWageCeiling;
    return grossSalary <= ceiling;
}

/**
 * Simple calculation (no period locking)
 * Kept for backward compatibility
 */
function calculate(grossSalary, config = {}) {
    const ceiling = config.esiWageCeiling || FALLBACK.esiWageCeiling;
    if (grossSalary > ceiling) {
        return {
            grossSalary,
            isEligible: false,
            employeeContribution: 0,
            employerContribution: 0,
            totalContribution: 0
        };
    }

    const empRate = (config.esiEmployeeRate || FALLBACK.esiEmployeeRate) / 100;
    const erRate = (config.esiEmployerRate || FALLBACK.esiEmployerRate) / 100;

    const employeeContribution = Math.round(grossSalary * empRate);
    const employerContribution = Math.round(grossSalary * erRate);

    return {
        grossSalary,
        isEligible: true,
        employeeContribution,
        employerContribution,
        totalContribution: employeeContribution + employerContribution
    };
}

/**
 * Calculate ESI with 6-month contribution period locking (ESIC-compliant)
 * 
 * @param {string} userId - Employee ObjectId
 * @param {number} grossSalary - Current month gross salary
 * @param {number} month - Processing month (1-12)
 * @param {number} year - Processing year
 * @param {object} config - StatutoryConfig from ConfigLoader
 * @param {object} session - MongoDB session (optional, for transactions)
 * @returns {object} ESI calculation result
 */
async function calculateWithPeriod(userId, grossSalary, month, year, config = {}, session = null) {
    const ceiling = config.esiWageCeiling || FALLBACK.esiWageCeiling;
    const period = getContributionPeriod(month, year);

    const sessionOpts = session ? { session } : {};

    // Check if eligibility is already locked for this period
    let periodRecord = await ESIContributionPeriod.findOne(
        { user: userId, periodStart: period.periodStart },
        null,
        sessionOpts
    );

    if (!periodRecord) {
        // First payroll in this period — lock eligibility based on current gross
        const eligible = grossSalary <= ceiling;
        periodRecord = await ESIContributionPeriod.findOneAndUpdate(
            { user: userId, periodStart: period.periodStart },
            {
                user: userId,
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                periodLabel: period.periodLabel,
                isEligible: eligible,
                grossAtEligibility: grossSalary,
                esiCeiling: ceiling,
                eligibilityLockedAt: new Date()
            },
            { upsert: true, new: true, ...sessionOpts }
        );
    }

    // Use locked eligibility (NOT current gross)
    if (!periodRecord.isEligible) {
        return {
            grossSalary,
            isEligible: false,
            employeeContribution: 0,
            employerContribution: 0,
            totalContribution: 0,
            periodLocked: true,
            periodLabel: period.periodLabel
        };
    }

    // Eligible — calculate contributions on current month gross
    const empRate = (config.esiEmployeeRate || FALLBACK.esiEmployeeRate) / 100;
    const erRate = (config.esiEmployerRate || FALLBACK.esiEmployerRate) / 100;

    const employeeContribution = Math.round(grossSalary * empRate);
    const employerContribution = Math.round(grossSalary * erRate);

    return {
        grossSalary,
        isEligible: true,
        employeeContribution,
        employerContribution,
        totalContribution: employeeContribution + employerContribution,
        periodLocked: true,
        periodLabel: period.periodLabel
    };
}

module.exports = {
    isEligible,
    calculate,
    calculateWithPeriod,
    getContributionPeriod
};
