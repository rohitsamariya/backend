/**
 * EPF Service — Indian EPFO Compliance
 * 
 * Rules:
 * - Company >20 employees → EPF mandatory
 * - If Basic+DA ≤ ₹15,000 → PF mandatory
 * - If Basic+DA > ₹15,000 → PF optional (configurable)
 * - Employee PF = 12% of (Basic+DA)
 * - Employer = 12% of (Basic+DA): 8.33% EPS + 3.67% EPF
 * - EPS capped at ₹15,000 wage ceiling
 * - Admin charges: 0.5% admin + 0.5% EDLI on Basic+DA
 * 
 * Config-driven: All rates loaded via ConfigLoader, hardcoded fallback only if DB unavailable.
 */

// Hardcoded fallback (used ONLY if config not passed AND DB unavailable)
const FALLBACK = {
    epfEmployeeRate: 12,
    epfEmployerRate: 12,
    epsRate: 8.33,
    epfWageCeiling: 15000,
    epfAdminRate: 0.5,
    epfEdliRate: 0.5
};

/**
 * Check if EPF is applicable for an employee
 * @param {number} basicPlusDa
 * @param {boolean} pfOptedOut
 * @param {object} config - StatutoryConfig from ConfigLoader
 */
function isEligible(basicPlusDa, pfOptedOut = false, config = {}) {
    const ceiling = config.epfWageCeiling || FALLBACK.epfWageCeiling;
    // Mandatory if Basic+DA ≤ wage ceiling
    if (basicPlusDa <= ceiling) {
        return true; // Cannot opt out
    }
    // Optional if Basic+DA > ceiling
    return !pfOptedOut;
}

/**
 * Calculate EPF contributions
 * @param {number} basicPlusDa - Basic + DA amount
 * @param {object} config - StatutoryConfig from ConfigLoader
 * @returns {object} EPF breakdown
 */
function calculate(basicPlusDa, config = {}) {
    const empRate = (config.epfEmployeeRate || FALLBACK.epfEmployeeRate) / 100;
    const employerRate = (config.epfEmployerRate || FALLBACK.epfEmployerRate) / 100;
    const epsRate = (config.epsRate || FALLBACK.epsRate) / 100;
    const ceiling = config.epfWageCeiling || FALLBACK.epfWageCeiling;
    const adminRate = (config.epfAdminRate != null ? config.epfAdminRate : FALLBACK.epfAdminRate) / 100;
    const edliRate = (config.epfEdliRate != null ? config.epfEdliRate : FALLBACK.epfEdliRate) / 100;

    // Employee PF — rate% of total Basic+DA
    const employeePF = Math.round(basicPlusDa * empRate);

    // Employer EPS — epsRate% capped at wage ceiling
    const epsCeiling = Math.min(basicPlusDa, ceiling);
    const employerEPS = Math.round(epsCeiling * epsRate);

    // Employer EPF — remainder of employer rate after EPS diversion
    const employerTotal = Math.round(basicPlusDa * employerRate);
    const employerEPF = employerTotal - employerEPS;

    // Admin charges (employer cost, not deducted from employee)
    const adminCharges = Math.round(basicPlusDa * (adminRate + edliRate));

    return {
        basicPlusDa,
        employeePF,
        employerEPS,
        employerEPF,
        employerTotal,
        totalContribution: employeePF + employerTotal,
        adminCharges
    };
}

/**
 * Generate ECR line item for a contribution
 */
function generateECRLine(contribution, employeeDetails, config = {}) {
    const ceiling = config.epfWageCeiling || FALLBACK.epfWageCeiling;
    return {
        uan: employeeDetails.uanNumber || '',
        memberName: employeeDetails.name || '',
        grossWages: contribution.basicPlusDa,
        epfWages: contribution.basicPlusDa,
        epsWages: Math.min(contribution.basicPlusDa, ceiling),
        edliWages: contribution.basicPlusDa,
        employeePF: contribution.employeePF,
        employerEPS: contribution.employerEPS,
        employerEPF: contribution.employerEPF,
        ncp: 0,
        refundOfAdvances: 0
    };
}

module.exports = { isEligible, calculate, generateECRLine };
