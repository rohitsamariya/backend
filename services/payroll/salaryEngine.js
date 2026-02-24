/**
 * Salary Engine — Master Payroll Orchestrator
 * 
 * Processes payroll for individual employees or batch.
 * Calls EPF, ESI, TDS, PT services.
 * Handles: LOP, mid-month join/exit, pro-rating, validation, arrears.
 * Idempotent — upserts PayrollSummary by user+month+year.
 * 
 * FIXES APPLIED:
 * - Fix 1: TDS uses projected annual tax (YTD actual + remaining projected)
 * - Fix 2: ESI uses 6-month contribution period locking
 * - Fix 3: PT enforces ₹2,500 annual cap
 * - Fix 4: All services receive config from ConfigLoader
 * - Fix 5: processEmployee wrapped in MongoDB transaction
 * - Fix 6: runBranchPayroll uses chunked Promise.allSettled
 * - Fix 7: Arrears engine detects salary changes mid-FY
 * - Fix 8: Payslip includes amountInWords
 */

const mongoose = require('mongoose');
const PayrollSummary = require('../../models/PayrollSummary');
const SalaryStructure = require('../../models/payroll/SalaryStructure');
const PayrollCycle = require('../../models/payroll/PayrollCycle');
const PFContribution = require('../../models/payroll/PFContribution');
const ESIContribution = require('../../models/payroll/ESIContribution');
const TDSRecord = require('../../models/payroll/TDSRecord');
const ProfessionalTaxRecord = require('../../models/payroll/ProfessionalTaxRecord');
const PayrollAdjustment = require('../../models/payroll/PayrollAdjustment');
const InvestmentDeclaration = require('../../models/payroll/InvestmentDeclaration');
const Attendance = require('../../models/Attendance');
const violationService = require('../violationService');
const User = require('../../models/User');
const Branch = require('../../models/Branch');
const Shift = require('../../models/Shift');
const BranchPayrollRun = require('../../models/payroll/BranchPayrollRun');
const LeaveLedger = require('../../models/payroll/LeaveLedger');
const { DateTime } = require('luxon');

const epfService = require('./epfService');
const esiService = require('./esiService');
const tdsService = require('./tdsService');
const ptService = require('./professionalTaxService');
const { loadConfig } = require('./configLoader');
const { numberToWords } = require('../../utils/numberToWords');
const crypto = require('crypto');
const EventEmitter = require('events');

class PayrollEmitter extends EventEmitter { }
const payrollEmitter = new PayrollEmitter();

// Requirement 6: Background Email Sending
payrollEmitter.on('PAYROLL_FINALIZED', async (data) => {
    try {
        const { payrollIds } = data;
        const emailService = require('../emailService');
        // In production, this would be pushed to a Redis/Bull queue
        for (const id of payrollIds) {
            await emailService.sendPayslipEmail(id).catch(err => console.error(`Email fail for ${id}:`, err));
        }
    } catch (err) {
        console.error('Background payroll notification error:', err);
    }
});

const CHUNK_SIZE = 50; // Requirement 5: Increased chunk size

/**
 * Calculate arrears for salary structure change mid-FY (Fix 7)
 */
async function calculateArrears(userId, salaryStructure, month, year, session = null) {
    const sessionOpts = session ? { session } : {};

    // Check if there's a previous salary structure version
    const previousStructure = await SalaryStructure.findOne({
        user: userId,
        isActive: false,
        effectiveTo: { $ne: null },
        version: { $lt: salaryStructure.version }
    }, null, sessionOpts).sort({ version: -1 });

    if (!previousStructure) return { arrearAmount: 0, adjustment: null };

    const effectiveFrom = salaryStructure.effectiveFrom;
    const fy = tdsService.getFinancialYear(month, year);

    // Find months processed after effectiveFrom with old structure version
    const processedWithOld = await PayrollSummary.find({
        user: userId,
        salaryStructureVersion: previousStructure.version,
        $or: [
            // Same FY months after effectiveFrom
            { year: { $gte: effectiveFrom.getFullYear() } }
        ]
    }, null, sessionOpts).lean();

    // Filter to only months that should have used the new structure
    const affectedMonths = processedWithOld.filter(p => {
        const payrollDate = new Date(p.year, p.month - 1, 1);
        return payrollDate >= effectiveFrom;
    });

    if (affectedMonths.length === 0) return { arrearAmount: 0, adjustment: null };

    const oldGross = previousStructure.grossSalary;
    const newGross = salaryStructure.grossSalary;
    const diff = newGross - oldGross;

    if (diff <= 0) return { arrearAmount: 0, adjustment: null }; // No arrears for salary decrease

    const arrearAmount = diff * affectedMonths.length;
    const monthsCovered = affectedMonths.map(p => ({ month: p.month, year: p.year }));

    // Check if arrear already generated for this structure change
    const existingAdjustment = await PayrollAdjustment.findOne({
        user: userId,
        adjustmentType: 'ARREAR',
        salaryStructureVersion: salaryStructure.version,
        status: { $in: ['PENDING', 'APPLIED'] }
    }, null, sessionOpts);

    if (existingAdjustment) {
        return { arrearAmount: existingAdjustment.amount, adjustment: existingAdjustment };
    }

    // Create new arrear adjustment
    const adjustment = await PayrollAdjustment.create([{
        user: userId,
        adjustmentType: 'ARREAR',
        monthsCovered,
        oldGross,
        newGross,
        amount: arrearAmount,
        salaryStructureVersion: salaryStructure.version,
        status: 'PENDING',
        reason: `Salary revised from ₹${oldGross} to ₹${newGross} effective ${effectiveFrom.toISOString().slice(0, 10)}`
    }], sessionOpts);

    return { arrearAmount, adjustment: adjustment[0] };
}
/**
 * Process payroll for a single employee (Fix 5: Transaction-wrapped)
 * Gracefully falls back to non-transactional mode for standalone MongoDB.
 */
async function processEmployee(userId, month, year, options = {}) {
    // Load config once (Fix 4)
    // If we're in a re-run/recalculate context, we might want fresh config
    const config = options.config || await loadConfig(true);

    let session = null;
    let useTransaction = false;
    let user;

    try {
        session = await mongoose.startSession();
        session.startTransaction();
        useTransaction = true;

        // Try the first operation with session
        // Requirement 5: Use projections to keep memory low
        user = await User.findById(userId)
            .select('name joiningDate createdAt resignationDate branch shift isPfEligible panNumber uanNumber pfAccountNumber probationLeavesAllocated')
            .populate('shift', 'startTime endTime allowedLateMinutes allowedEarlyExitMinutes')
            .populate('branch', 'name timezone workingDays state')
            .session(session);
    } catch (txErr) {
        // Cleanup if session was opened
        if (session) {
            try { await session.abortTransaction(); } catch (e) { }
            await session.endSession();
        }
        session = null;
        useTransaction = false;

        // Fallback to non-transactional find
        user = await User.findById(userId)
            .select('name joiningDate createdAt resignationDate branch shift isPfEligible panNumber uanNumber pfAccountNumber probationLeavesAllocated')
            .populate('shift', 'startTime endTime allowedLateMinutes allowedEarlyExitMinutes')
            .populate('branch', 'name timezone workingDays state');
    }

    // Helper: session-aware query options
    const sOpts = session ? { session } : {};

    try {
        if (!user) {
            console.debug(`[SalaryEngine] User ${userId} not found`);
            throw new Error(`User ${userId} not found`);
        }
        if (!user.branch) {
            console.debug(`[SalaryEngine] User ${userId} has no branch assigned`);
            throw new Error(`User ${userId} has no branch assigned`);
        }

        console.debug(`[SalaryEngine] Processing employee ${user.name} (${userId}) for ${month}/${year}`);

        // 1. Load Salary Structure
        // Period end date for selection
        const tz = user.branch.timezone || 'Asia/Kolkata';
        const periodEnd = DateTime.fromObject({ year, month, day: 1 }, { zone: tz }).endOf('month').toJSDate();

        // Find the structure that was effective during this month
        let salaryStructure = await SalaryStructure.findOne({
            user: userId,
            effectiveFrom: { $lte: periodEnd }
        }, null, sOpts).sort({ effectiveFrom: -1, version: -1 });

        if (!salaryStructure) {
            // Fallback: If no structure exists BEFORE or DURING the month, 
            // take the absolute earliest one available (even if it's future-dated)
            const fallbackStructure = await SalaryStructure.findOne({ user: userId }, null, sOpts).sort({ effectiveFrom: 1 });

            if (!fallbackStructure) {
                console.debug(`[SalaryEngine] Skipped user ${userId}: No salary structure found at all.`);
                if (useTransaction) { await session.abortTransaction(); session.endSession(); }
                return { skipped: true, reason: 'STRUCTURE_MISSING' };
            }

            salaryStructure = fallbackStructure;
        }

        console.debug(`[SalaryEngine] Used salary structure version ${salaryStructure.version} for user ${userId}`);
        console.log('[SalaryEngine] User salaryStructure:', {
            userId,
            version: salaryStructure.version,
            effectiveFrom: salaryStructure.effectiveFrom,
            isActive: salaryStructure.isActive,
            basic: salaryStructure.basic,
            da: salaryStructure.da,
            hra: salaryStructure.hra,
            specialAllowance: salaryStructure.specialAllowance,
            otherAllowances: salaryStructure.otherAllowances,
            grossSalary: salaryStructure.grossSalary,
            monthlyCTC: salaryStructure.monthlyCTC,
            annualCTC: salaryStructure.annualCTC
        });

        // 2. Reprocessing Support: Mark previous records as SUPERSEDED
        // We look for any existing record for this user + month + year that is NOT already superseded
        const existingPayroll = await PayrollSummary.findOne({
            user: userId, month, year, status: { $ne: 'SUPERSEDED' }
        }).session(session);

        if (existingPayroll) {
            existingPayroll.status = 'SUPERSEDED';
            await existingPayroll.save({ session });

            // Critical: remove leave-ledger entries tied to superseded payroll,
            // otherwise repeated reprocessing keeps inflating leave deductions.
            await LeaveLedger.deleteMany({ referenceId: existingPayroll._id }, sOpts);

            options.excludingSupersededRunId = existingPayroll.payrollRunId;
        }

        // 3. Get branch timezone & month info
        const monthStart = DateTime.fromObject({ year, month, day: 1 }, { zone: tz });
        const daysInMonth = monthStart.daysInMonth;

        // Calculate actual working days based on branch config
        const workingDaysArray = user.branch.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        let actualWorkingDaysInMonth = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dt = monthStart.set({ day: d });
            if (workingDaysArray.includes(dt.toFormat('cccc'))) {
                actualWorkingDaysInMonth++;
            }
        }

        // 4. Calculate pro-rate factor (mid-month join/exit)
        let proRateFactor = 1;
        let isMidMonthJoin = false, isMidMonthExit = false;
        const monthEnd = monthStart.endOf('month');

        const joinDateJS = user.joiningDate || user.createdAt;
        const resignationDateJS = user.resignationDate;

        if (joinDateJS) {
            const joinDT = DateTime.fromJSDate(joinDateJS).setZone(tz);
            if (joinDT.year === year && joinDT.month === month && joinDT.day > 1) {
                isMidMonthJoin = true;
                let daysWorked = 0;
                for (let d = joinDT.day; d <= daysInMonth; d++) {
                    const dt = monthStart.set({ day: d });
                    if (workingDaysArray.includes(dt.toFormat('cccc'))) {
                        daysWorked++;
                    }
                }
                proRateFactor = actualWorkingDaysInMonth > 0 ? (daysWorked / actualWorkingDaysInMonth) : 1;
            } else if (joinDT > monthEnd) {
                console.log(`[SalaryEngine] Skipped user ${userId}: Employee joining in future (${joinDT.toISODate()})`);
                if (useTransaction) { await session.abortTransaction(); session.endSession(); }
                return { skipped: true, reason: 'NOT_JOINED_YET' };
            }
        }

        if (resignationDateJS) {
            const exitDT = DateTime.fromJSDate(resignationDateJS).setZone(tz);
            if (exitDT.year === year && exitDT.month === month && exitDT.day < daysInMonth) {
                isMidMonthExit = true;
                let daysWorked = 0;
                for (let d = 1; d <= exitDT.day; d++) {
                    const dt = monthStart.set({ day: d });
                    if (workingDaysArray.includes(dt.toFormat('cccc'))) {
                        daysWorked++;
                    }
                }
                proRateFactor *= (actualWorkingDaysInMonth > 0 ? (daysWorked / actualWorkingDaysInMonth) : 1);
            } else if (exitDT < monthStart) {
                if (useTransaction) { await session.abortTransaction(); session.endSession(); }
                return { skipped: true, reason: 'ALREADY_RESIGNED' };
            }
        }

        // 5. Attendance & LOP (Requirement: Process even if no attendance found, assume absent)
        const startOfMonth = monthStart.startOf('day').toUTC().toJSDate();
        const endOfMonth = monthEnd.endOf('day').toUTC().toJSDate();

        const attRecords = await Attendance.find({ user: userId, date: { $gte: startOfMonth, $lte: endOfMonth } }).session(session);

        const stats = await violationService.calculateViolations(user, month, year, {
            attendanceRecords: attRecords,
            session,
            excludingSupersededRunId: options.excludingSupersededRunId,
            payrollRunId: options.payrollRunId
        });
        const lopDays = stats.totalDeductionDays;
        const effectiveWorkingDays = Math.round(actualWorkingDaysInMonth * proRateFactor);
        const paidDays = Math.max(0, effectiveWorkingDays - lopDays);

        // 6. Earnings Calculation (Requirement 7: Arrears & LOP logic)
        // We calculate monthlyGross from components to be safe against inconsistent grossSalary field
        const monthlyGross = (salaryStructure.basic || 0) + (salaryStructure.da || 0) + (salaryStructure.hra || 0) +
            (salaryStructure.specialAllowance || 0) + (salaryStructure.otherAllowances || 0);

        const basic = Math.round(salaryStructure.basic * proRateFactor);
        const da = Math.round(salaryStructure.da * proRateFactor);
        const hra = Math.round(salaryStructure.hra * proRateFactor);
        const specialAllowance = Math.round(salaryStructure.specialAllowance * proRateFactor);
        const otherAllowances = Math.round(salaryStructure.otherAllowances * proRateFactor);
        const grossBeforeLOP = basic + da + hra + specialAllowance + otherAllowances;
        console.log('[SalaryEngine] Calculated monthly gross:', {
            userId,
            month,
            year,
            monthlyGross,
            basic,
            da,
            hra,
            specialAllowance,
            otherAllowances,
            grossBeforeLOP
        });

        // REQUIREMENT: LOP Daily Rate = Monthly Gross / Total Working Days of that Month
        // Fix: Use the consistent monthlyGross instead of the potentially corrupted DB field
        const perDaySalary = actualWorkingDaysInMonth > 0 ? (monthlyGross / actualWorkingDaysInMonth) : 0;
        const lopDeduction = Math.round(lopDays * perDaySalary);
        console.log('[SalaryEngine] LOP Calculation:', { userId, month, year, lopDays, perDaySalary, lopDeduction });

        const { arrearAmount, adjustment: arrearAdjustment } = await calculateArrears(
            userId, salaryStructure, month, year, session
        );

        const earnedGross = Math.max(0, grossBeforeLOP - lopDeduction + arrearAmount);
        console.log('[SalaryEngine] Arrears:', { userId, month, year, arrearAmount });
        console.log('[SalaryEngine] Final gross used:', {
            userId,
            month,
            year,
            grossBeforeLOP,
            lopDeduction,
            arrearAmount,
            earnedGross
        });

        // Accurate Basic + DA for PF (pro-rated and LOP adjusted)
        const perDayBasic = actualWorkingDaysInMonth > 0 ? (salaryStructure.basic / actualWorkingDaysInMonth) : 0;
        const perDayDa = actualWorkingDaysInMonth > 0 ? (salaryStructure.da / actualWorkingDaysInMonth) : 0;
        const earnedBasic = Math.max(0, basic - Math.round(lopDays * perDayBasic));
        const earnedDa = Math.max(0, da - Math.round(lopDays * perDayDa));
        const pfWages = earnedBasic + earnedDa;

        // 8. statutory calculations
        const pfApplicable = user.isPfEligible;
        let epfResult = { employeePF: 0, employerTotal: 0, employerEPS: 0, employerEPF: 0, adminCharges: 0 };
        if (pfApplicable) {
            epfResult = epfService.calculate(pfWages, config);
        }

        const state = user.branch?.state || 'Maharashtra';
        const isFebruary = month === 2;
        const ptResult = await ptService.calculateWithCap(
            userId, earnedGross, state, isFebruary, month, year, config, session
        );

        const esiResult = await esiService.calculateWithPeriod(
            userId, earnedGross, month, year, config, session
        );

        const tdsResult = await tdsService.calculateProjectedAnnualTax(
            userId, month, year, earnedGross, salaryStructure, config, session
        );
        const monthlyTDS = tdsResult.monthlyTDS;

        // 12. Total Deductions
        const totalStatutoryDeductions = epfResult.employeePF + esiResult.employeeContribution + ptResult.ptAmount + monthlyTDS;
        const totalDeductions = totalStatutoryDeductions + lopDeduction;
        const netPay = Math.max(0, earnedGross - totalStatutoryDeductions); // earnedGross already has lopDeduction removed

        // 14. Cost to Company
        const costToCompany = earnedGross + epfResult.employerTotal + epfResult.adminCharges + esiResult.employerContribution;

        // 15. Build transparent calculation log (Requirement 8)
        const calcLog = JSON.stringify({
            probationStatus: stats.isPostProbation ? 'POST_PROBATION' : 'ON_PROBATION',
            workingDaysInMonth: actualWorkingDaysInMonth,
            proRateFactor: proRateFactor.toFixed(4),
            effectiveWorkingDays,
            dailyRate: perDaySalary.toFixed(2),
            attendance: {
                present: Math.max(0, effectiveWorkingDays - stats.totalAbsents),
                absent: stats.totalAbsents,
                halfDay: stats.totalHalfDays,
                penalties: stats.penaltyHalfDays
            },
            leaveAndLop: {
                leaveUsedThisMonth: stats.leavesUsed,
                lopDays: stats.totalDeductionDays,
                lopAmount: lopDeduction,
                remainingLeaveBalance: stats.newAvailableLeaves
            },
            arrears: { amount: arrearAmount, reason: arrearAdjustment?.reason || 'N/A' },
            statutory: {
                pfWages,
                pf: epfResult.employeePF,
                esi: esiResult.employeeContribution,
                pt: ptResult.ptAmount,
                ptState: state,
                tds: monthlyTDS
            }
        });

        // 16. Safety Check: ensure no active payroll exists before insert
        const activeExists = await PayrollSummary.findOne({
            user: userId,
            month,
            year,
            status: { $ne: 'SUPERSEDED' }
        }, null, sOpts);

        if (activeExists) {
            throw new Error(`Active payroll already exists for this user (${userId}) for ${month}/${year}`);
        }

        // 17. Create NEW PayrollSummary (Requirement 6: Audit Log)
        const payroll = await PayrollSummary.create([{
            user: userId,
            branch: user.branch._id,
            payrollCycle: options.cycleId || undefined,
            month, year,
            basic, da, hra, specialAllowance, otherAllowances,
            arrears: arrearAmount,
            grossSalary: grossBeforeLOP + arrearAmount,
            totalWorkingDays: actualWorkingDaysInMonth,
            presentDays: Math.max(0, actualWorkingDaysInMonth - stats.totalAbsents),
            halfDays: stats.totalHalfDays,
            absentDays: stats.totalAbsents,
            lopDays: stats.totalDeductionDays,
            paidDays,
            availableLeaves: stats.newAvailableLeaves,
            leavesUsedThisMonth: stats.leavesUsed,
            joiningDate: joinDateJS,
            exitDate: resignationDateJS,
            isMidMonthJoin, isMidMonthExit,
            proRateFactor,
            employeePF: epfResult.employeePF,
            employeeESI: esiResult.employeeContribution,
            professionalTax: ptResult.ptAmount,
            tds: monthlyTDS,
            lopDeduction,
            otherDeductions: 0,
            totalDeductions,
            netSalary: netPay,
            employerPF: epfResult.employerTotal,
            employerESI: esiResult.employerContribution,
            employerPFAdmin: epfResult.adminCharges,
            costToCompany,
            pfApplicable,
            esiApplicable: esiResult.isEligible,
            tdsApplicable: monthlyTDS > 0,
            ptApplicable: ptResult.ptAmount > 0,
            taxRegime: tdsResult.regime,
            status: 'PROCESSED',
            emailSent: false,
            emailSentAt: null,
            salaryStructureVersion: salaryStructure.version,
            probationStatus: stats.isPostProbation ? 'POST_PROBATION' : 'ON_PROBATION',
            payrollRunId: options.payrollRunId,
            calculationLog: calcLog
        }], sOpts);

        const payrollDoc = payroll[0];

        // 17. Update User Leaves & Create Ledger Entries (Fix 5)
        // 17. Update User Leaves & Create Ledger Entries (Requirement 3: Ledger is Source of Truth)
        const ledgerOps = [];

        // No longer updating user.availableLeaves here as it's calculated from ledger
        // We only maintain the probation allocation flag
        if (stats.isPostProbation && !user.probationLeavesAllocated) {
            ledgerOps.push(User.findByIdAndUpdate(userId, {
                $set: { probationLeavesAllocated: true }
            }, sOpts));
        }

        // Create Leave Ledger records for deductions/corrections if any
        if (stats.leavesUsed > 0) {
            ledgerOps.push(LeaveLedger.create([{
                user: userId, month, year,
                payrollCycle: options.cycleId,
                type: 'DEDUCTION',
                leaveType: 'PAID',
                days: stats.leavesUsed,
                reason: `Deducted for absences/penalties in ${month}/${year}`,
                referenceId: payrollDoc._id,
                payrollRunId: options.payrollRunId
            }], sOpts));
        }

        if (stats.totalDeductionDays > 0) {
            ledgerOps.push(LeaveLedger.create([{
                user: userId, month, year,
                payrollCycle: options.cycleId,
                type: 'DEDUCTION',
                leaveType: stats.isPostProbation ? 'UNPAID' : 'PROBATION_PENALTY',
                days: stats.totalDeductionDays,
                reason: `LOP Deduction for ${stats.totalDeductionDays} days`,
                referenceId: payrollDoc._id,
                payrollRunId: options.payrollRunId
            }], sOpts));
        }

        if (pfApplicable) {
            ledgerOps.push(PFContribution.findOneAndUpdate(
                { user: userId, month, year },
                {
                    user: userId, payrollCycle: options.cycleId, branch: user.branch._id,
                    month, year, basicPlusDa: pfWages,
                    ...epfResult,
                    uanNumber: user.uanNumber, pfAccountNumber: user.pfAccountNumber,
                    memberName: user.name,
                    isVoluntary: pfWages > (config.epfWageCeiling || 15000),
                    status: 'PROCESSED'
                },
                { upsert: true, new: true, ...sOpts }
            ));
        }

        if (esiResult.isEligible) {
            ledgerOps.push(ESIContribution.findOneAndUpdate(
                { user: userId, month, year },
                {
                    user: userId, payrollCycle: options.cycleId, branch: user.branch._id,
                    month, year, grossSalary: earnedGross,
                    employeeContribution: esiResult.employeeContribution,
                    employerContribution: esiResult.employerContribution,
                    totalContribution: esiResult.totalContribution,
                    isEligible: true
                },
                { upsert: true, new: true, ...sOpts }
            ));
        }

        ledgerOps.push(TDSRecord.findOneAndUpdate(
            { user: userId, month, year },
            {
                user: userId, payrollCycle: options.cycleId, branch: user.branch._id,
                month, year, financialYear: tdsResult.financialYear,
                regime: tdsResult.regime,
                annualGross: tdsResult.annualGross,
                standardDeduction: tdsResult.tdsCalc.standardDeduction,
                section80C: tdsResult.tdsCalc.section80C,
                section80D: tdsResult.tdsCalc.section80D,
                hraExemption: tdsResult.tdsCalc.hraExemption,
                otherExemptions: tdsResult.tdsCalc.otherExemptions,
                totalExemptions: tdsResult.tdsCalc.totalExemptions,
                taxableIncome: tdsResult.tdsCalc.taxableIncome,
                annualTaxBeforeCess: tdsResult.tdsCalc.annualTaxBeforeCess,
                surcharge: tdsResult.tdsCalc.surcharge,
                cess: tdsResult.tdsCalc.cess,
                totalAnnualTax: tdsResult.tdsCalc.totalAnnualTax,
                tdsPaidYTD: tdsResult.tdsPaidYTD,
                remainingMonths: tdsResult.remainingMonths,
                monthlyTDS,
                panNumber: user.panNumber,
                assessmentYear: (() => {
                    const fyStart = parseInt(tdsResult.financialYear.split('-')[0]);
                    return `${fyStart + 1}-${fyStart + 2}`;
                })()
            },
            { upsert: true, new: true, ...sOpts }
        ));

        if (ptResult.ptAmount > 0) {
            ledgerOps.push(ProfessionalTaxRecord.findOneAndUpdate(
                { user: userId, month, year },
                {
                    user: userId, payrollCycle: options.cycleId, branch: user.branch._id,
                    month, year, state, grossSalary: earnedGross,
                    ptAmount: ptResult.ptAmount, isFebruary,
                    status: 'PROCESSED'
                },
                { upsert: true, new: true, ...sOpts }
            ));
        }

        // Mark arrear as applied
        if (arrearAdjustment && arrearAdjustment.status === 'PENDING') {
            ledgerOps.push(PayrollAdjustment.findByIdAndUpdate(
                arrearAdjustment._id,
                {
                    status: 'APPLIED',
                    appliedInMonth: month,
                    appliedInYear: year,
                    appliedInPayrollId: payrollDoc._id,
                    appliedAt: new Date()
                },
                sOpts
            ));
        }

        await Promise.all(ledgerOps);

        // Commit transaction (Fix 5)
        if (useTransaction) {
            await session.commitTransaction();
            session.endSession();
        }

        return { skipped: false, data: payrollDoc };

    } catch (error) {
        // Rollback on any error (Fix 5)
        if (useTransaction) {
            try { await session.abortTransaction(); } catch (e) { /* ignore abort errors */ }
            session.endSession();
        }
        throw error;
    }
}

/**
 * Run payroll for an entire branch (batch)
 * Fix 6: Chunked Promise.allSettled for parallel processing
 */
async function runBranchPayroll(branchId, month, year, initiatedBy) {
    // 1. Requirement 4: Concurrency Protection
    const existingRun = await BranchPayrollRun.findOne({ branch: branchId, month, year });
    if (existingRun && existingRun.status === 'RUNNING') {
        throw new Error('Payroll already running for this branch and period');
    }

    // Requirement 2: Generate UUID RunID
    const payrollRunId = crypto.randomUUID();

    // 2. Create/Update Run Status
    let runRecord = existingRun;
    if (!runRecord) {
        runRecord = await BranchPayrollRun.create({
            branch: branchId, month, year,
            status: 'RUNNING',
            runBy: initiatedBy,
            payrollRunId
        });
    } else {
        runRecord.status = 'RUNNING';
        runRecord.startedAt = new Date();
        runRecord.processedCount = 0;
        runRecord.failedCount = 0;
        runRecord.payrollRunId = payrollRunId;
        await runRecord.save();
    }

    // Load config once
    const config = await loadConfig(true);

    let cycle = await PayrollCycle.findOne({ branch: branchId, month, year });
    if (!cycle) {
        cycle = await PayrollCycle.create({
            branch: branchId, month, year,
            status: 'PROCESSING',
            initiatedBy,
            processingStartedAt: new Date()
        });
    } else {
        cycle.status = 'PROCESSING';
        cycle.processingStartedAt = new Date();
        cycle.processed = 0;
        cycle.failed = 0;
        await cycle.save();
    }

    // 3. Requirement: Match listPayroll logic exactly
    const bId = new mongoose.Types.ObjectId(branchId.toString().trim());
    const userQuery = {
        branch: bId,
        status: 'ACTIVE',
        role: 'EMPLOYEE'
    };
    console.debug(`[SalaryEngine] Fetching employees for branch ${branchId} with query:`, JSON.stringify(userQuery));

    const employees = await User.find(userQuery).select('_id name');

    console.log(`[SalaryEngine] Found ${employees.length} eligible employees for branch ${branchId}`);
    if (employees.length === 0) {
        // Log some details about any users in this branch to see why they don't match
        const sampleUsers = await User.find({ branch: bId }).limit(10).select('name status role branch');
        console.debug(`[SalaryEngine] Sample users in branch ${branchId}:`, JSON.stringify(sampleUsers));

        const totalInBranch = await User.countDocuments({ branch: bId });
        console.debug(`[SalaryEngine] Total users (any status/role) in branch ${branchId}: ${totalInBranch}`);
    }

    cycle.totalEmployees = employees.length;
    runRecord.totalEmployees = employees.length;
    await cycle.save();
    await runRecord.save();

    let processedPayrollIds = [];
    let processed = 0, failed = 0;

    // 4. Requirement 5: Increased chunk size 50
    for (let i = 0; i < employees.length; i += CHUNK_SIZE) {
        const batch = employees.slice(i, i + CHUNK_SIZE);

        console.debug(`[SalaryEngine][${payrollRunId}] Starting batch ${Math.floor(i / CHUNK_SIZE) + 1} with ${batch.length} employees`);

        const results = await Promise.allSettled(
            batch.map(emp => {
                console.debug(`[SalaryEngine][${payrollRunId}] START employee=${emp._id} name=${emp.name}`);
                return processEmployee(emp._id.toString(), month, year, {
                    cycleId: cycle._id,
                    payrollRunId,
                    config
                });
            })
        );

        for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const employee = batch[j];

            if (result.status === 'fulfilled' && !result.value.skipped) {
                processedPayrollIds.push(result.value.data._id);
                processed++;
                console.debug(`[SalaryEngine][${payrollRunId}] SUCCESS employee=${employee._id} name=${employee.name}`);
            } else {
                if (result.status === 'rejected') {
                    console.error(`[SalaryEngine][${payrollRunId}] FAILED employee=${employee._id} name=${employee.name} error=${result.reason?.message || result.reason}`);
                } else if (result.value?.skipped) {
                    console.warn(`[SalaryEngine][${payrollRunId}] SKIPPED employee=${employee._id} name=${employee.name} reason=${result.value.reason}`);
                }
                failed++;
            }
        }

        cycle.processed = processed;
        cycle.failed = failed;
        runRecord.processedCount = processed;
        runRecord.failedCount = failed;
        await cycle.save();
        await runRecord.save();
    }

    // 5. Finalize
    await syncCycleTotals(cycle._id);

    runRecord.status = 'COMPLETED';
    runRecord.completedAt = new Date();
    runRecord.processedCount = processed;
    runRecord.failedCount = failed;
    await runRecord.save();

    // Ensure response carries actual run counters
    const finalCycle = await PayrollCycle.findById(cycle._id);
    if (finalCycle) {
        finalCycle.processed = processed;
        finalCycle.failed = failed;
        await finalCycle.save();
    }

    // Requirement 6: Emit Background Notification
    payrollEmitter.emit('PAYROLL_FINALIZED', { payrollIds: processedPayrollIds });

    return finalCycle || cycle;
}

/**
 * Sync PayrollCycle totals by aggregating all linked PayrollSummary records
 */
async function syncCycleTotals(cycleId) {
    const cycle = await PayrollCycle.findById(cycleId);
    if (!cycle) return;

    const stats = await PayrollSummary.aggregate([
        {
            $match: {
                branch: new mongoose.Types.ObjectId(cycle.branch),
                month: cycle.month,
                year: cycle.year,
                status: { $in: ['PROCESSED', 'FINALIZED'] }
            }
        },
        {
            $group: {
                _id: null,
                totalGross: { $sum: '$grossSalary' },
                totalDeductions: { $sum: '$totalDeductions' },
                totalNetPay: { $sum: '$netSalary' },
                totalEmployerPF: { $sum: '$employerPF' },
                totalEmployerESI: { $sum: '$employerESI' },
                totalCostToCompany: { $sum: '$costToCompany' },
                processed: { $sum: { $cond: [{ $eq: ['$status', 'PROCESSED'] }, 1, 0] } },
                finalized: { $sum: { $cond: [{ $eq: ['$status', 'FINALIZED'] }, 1, 0] } }
            }
        }
    ]);

    if (stats.length > 0) {
        const s = stats[0];
        cycle.totalGross = s.totalGross;
        cycle.totalDeductions = s.totalDeductions;
        cycle.totalNetPay = s.totalNetPay;
        cycle.totalEmployerPF = s.totalEmployerPF;
        cycle.totalEmployerESI = s.totalEmployerESI;
        cycle.totalCostToCompany = s.totalCostToCompany;
        cycle.processed = s.processed + s.finalized;
        // Total employees count might change if users were moved in/out
        cycle.totalEmployees = await User.countDocuments({
            branch: cycle.branch,
            status: 'ACTIVE',
            role: 'EMPLOYEE'
        });
    }

    cycle.processingCompletedAt = new Date();
    cycle.status = 'PROCESSED';
    await cycle.save();
}

/**
 * Generate payslip JSON for a payroll record (Fix 8: amountInWords)
 */
async function getPayslipData(payrollId) {
    const payroll = await PayrollSummary.findById(payrollId)
        .populate('user', 'name email panNumber uanNumber pfAccountNumber bankDetails employeeId')
        .populate('branch', 'name');

    if (!payroll) throw new Error('Payroll record not found');

    return {
        employee: {
            name: payroll.user.name,
            email: payroll.user.email,
            employeeId: payroll.user.employeeId,
            pan: payroll.user.panNumber,
            uan: payroll.user.uanNumber,
            pf: payroll.user.pfAccountNumber,
            bank: payroll.user.bankDetails
        },
        period: { month: payroll.month, year: payroll.year },
        branch: payroll.branch?.name,
        earnings: {
            basic: payroll.basic,
            da: payroll.da,
            hra: payroll.hra,
            specialAllowance: payroll.specialAllowance,
            otherAllowances: payroll.otherAllowances,
            arrears: payroll.arrears || 0,
            grossSalary: payroll.grossSalary
        },
        attendance: {
            totalDays: payroll.totalWorkingDays,
            present: payroll.presentDays,
            halfDays: payroll.halfDays,
            absent: payroll.absentDays,
            lop: payroll.lopDays,
            paid: payroll.paidDays,
            availableLeaves: payroll.availableLeaves || 0,
            leavesUsed: payroll.leavesUsedThisMonth || 0,
            showLeaves: payroll.availableLeaves !== undefined && (payroll.availableLeaves > 0 || payroll.leavesUsedThisMonth > 0) && (payroll.presentDays + payroll.paidDays > 0) // Basic heuristic or check probation status
        },
        deductions: {
            employeePF: payroll.employeePF,
            employeeESI: payroll.employeeESI,
            professionalTax: payroll.professionalTax,
            tds: payroll.tds,
            lopDeduction: payroll.lopDeduction,
            totalDeductions: payroll.totalDeductions
        },
        netSalary: payroll.netSalary,
        netSalaryInWords: numberToWords(payroll.netSalary),  // Fix 8
        employerCosts: {
            employerPF: payroll.employerPF,
            employerESI: payroll.employerESI,
            adminCharges: payroll.employerPFAdmin,
            costToCompany: payroll.costToCompany
        },
        statutory: {
            pfApplicable: payroll.pfApplicable,
            esiApplicable: payroll.esiApplicable,
            tdsApplicable: payroll.tdsApplicable,
            ptApplicable: payroll.ptApplicable,
            regime: payroll.taxRegime
        },
        status: payroll.status,
        generatedAt: payroll.generatedAt,
        calculationLog: payroll.calculationLog
    };
}

module.exports = { processEmployee, runBranchPayroll, getPayslipData, syncCycleTotals };
