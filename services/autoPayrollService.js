const PayrollBatch = require('../models/PayrollBatch');
const PayrollSummary = require('../models/PayrollSummary');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Attendance = require('../models/Attendance');
const { DateTime } = require('luxon');
const violationService = require('./violationService');
const { sendSalarySlipEmail } = require('./emailService');
const { generateSalarySlipPDF } = require('./salarySlipService'); // Helper to gen PDF buffer

// Calculation Rules
const calculateSalary = (user, month, year, attendanceStats, daysInMonth) => {
    const CTC = user.monthlyCTC || 0;

    // 1. Earnings Breakdown (Gross Salary Refactoring: 50/25/12.5/12.5)
    // CTC here refers to Gross Salary
    const GrossSalary = CTC;
    const Basic = GrossSalary * 0.50;
    const HRA = GrossSalary * 0.25;
    const DA = GrossSalary * 0.125;
    const SpecialAllowance = GrossSalary * 0.125;
    const Conveyance = 0; // Remainder removed in strict breakdown

    // 2. Deductions
    // PF
    let PF_Employee = 0;
    let PF_Employer = 0;
    if (user.isPfEligible) {
        // PF is specifically calculated as 12% of Gross Salary instead of Basic
        PF_Employee = Math.round(GrossSalary * 0.12);
        PF_Employer = Math.round(GrossSalary * 0.12);
    }

    // Professional Tax (Fixed 200)
    const PT = GrossSalary > 0 ? 200 : 0;

    // TDS (Simple Annual Logic > 7L => 5% of monthly basic)
    const AnnualCTC = CTC * 12;
    const TDS = AnnualCTC > 700000 ? (Basic * 0.05) : 0;

    // Discipline (Based on Attendance from violationService)
    const perDayCost = GrossSalary / daysInMonth;
    const disciplineDeduction = Math.round(attendanceStats.totalDeductionDays * perDayCost);

    const TotalDeductions = PF_Employee + PT + TDS + disciplineDeduction;

    // 3. Net
    const NetSalary = Math.max(0, GrossSalary - TotalDeductions);

    return {
        basicSalary: Basic,
        hra: HRA,
        da: DA,
        conveyance: Conveyance,
        specialAllowance: SpecialAllowance,
        grossSalary: GrossSalary,
        pfEmployee: PF_Employee,
        pfEmployer: PF_Employer,
        professionalTax: PT,
        tds: TDS,
        disciplineDeduction: disciplineDeduction,
        totalDeductions: TotalDeductions,
        netSalary: NetSalary
    };
};

const runMonthlyPayroll = async (targetDate) => {
    // targetDate should be a Luxon object in the target month (e.g., 1st of CURRENT Month to process PREVIOUS Month)
    // Actually, Prompt says "calculate salary for previous month".
    // So if Cron runs Feb 1st, we process Jan.

    // We iterate BRANCHES to handle Timezones correctly.
    const branches = await Branch.find({ isActive: true });

    for (const branch of branches) {
        try {
            // Determine "Previous Month" relative to Branch Timezone
            const nowBranch = DateTime.now().setZone(branch.timezone || 'Asia/Kolkata');
            // If we are triggered manually for a specific date, use that? 
            // The service receives `targetDate` (Date object or Luxon).
            // Let's assume `targetDate` is "Now".
            const refDate = targetDate ? DateTime.fromJSDate(targetDate).setZone(branch.timezone) : nowBranch;
            const prevMonth = refDate.minus({ months: 1 });

            const month = prevMonth.month;
            const year = prevMonth.year; // Handle year rollover

            console.log(`Processing Payroll for Branch: ${branch.name} (${month}/${year})`);

            // 1. Check Batch Existence
            const existingBatch = await PayrollBatch.findOne({ branch: branch._id, month, year });
            if (existingBatch) {
                console.log(`Skipping: Batch already exists for ${branch.name}`);
                continue;
            }

            // 2. Create Batch (GENERATING)
            const batch = await PayrollBatch.create({
                branch: branch._id,
                month,
                year,
                status: 'GENERATING'
            });

            // 3. Get Active Employees with CTC
            const employees = await User.find({
                branch: branch._id,
                status: 'ACTIVE',
                monthlyCTC: { $gt: 0 } // Skip valid 0 CTC (e.g. interns?) or just > 0
            }).populate('shift');

            console.log(`Found ${employees.length} employees for payroll.`);

            let processedCount = 0;
            let batchTotalPayout = 0;

            for (const user of employees) {
                try {
                    // Check if Summary Exists (Idempotency at User Level)
                    const existingSummary = await PayrollSummary.findOne({ user: user._id, month, year });
                    if (existingSummary) continue;

                    // Fetch Attendance Stats
                    const startOfMonth = prevMonth.startOf('day').toUTC().toJSDate(); // But start of Month!
                    const startOfPMonth = prevMonth.startOf('month').toUTC().toJSDate();
                    const endOfPMonth = prevMonth.endOf('month').toUTC().toJSDate();

                    // Aggregation for Attendance
                    const stats = await Attendance.aggregate([
                        {
                            $match: {
                                user: user._id,
                                date: { $gte: startOfPMonth, $lte: endOfPMonth }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
                                halfDay: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } },
                                absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } } // Explicit
                            }
                        }
                    ]);

                    const attData = stats[0] || { present: 0, halfDay: 0, absent: 0 };

                    // Calc "Days in Month"
                    const daysInMonth = prevMonth.daysInMonth;
                    // Auto-calculate "Implicit Absent" (No Record)
                    // TotalDays = Present + Half + Absent + ImplicitAbsent
                    // ImplicitAbsent = TotalDays - (Present + Half + Absent)
                    const totalRecorded = attData.present + attData.halfDay + attData.absent;
                    const implicitAbsent = Math.max(0, daysInMonth - totalRecorded);
                    const finalAbsent = attData.absent + implicitAbsent;

                    // Calculate Salary using violationService
                    const vStats = await violationService.calculateViolations(user, month, year);
                    const totalDeductionDays = vStats.totalDeductionDays;

                    const salaryData = calculateSalary(user, month, year, {
                        ...attData,
                        absentDays: finalAbsent,
                        totalDeductionDays
                    }, daysInMonth);

                    // Create Summary
                    const summary = await PayrollSummary.create({
                        user: user._id,
                        branch: branch._id,
                        month,
                        year,
                        ...salaryData,
                        totalWorkingDays: daysInMonth,
                        presentDays: attData.present,
                        halfDays: attData.halfDay,
                        absentDays: finalAbsent,
                        status: 'GENERATED' // Initial
                    });

                    // Generate PDF & Email (Async, but awaited here for batch safety)
                    // If Email Fails, we swallow error to not kill batch, but log.
                    try {
                        // Reuse existing service (requires update to use Summary object)
                        // Or utilize `salarySlipService` directly if it accepts ID.
                        // `generateSalarySlipPDF` takes ID.
                        const pdfBuffer = await generateSalarySlipPDF(summary._id);
                        await sendSalarySlipEmail(user, month, year, pdfBuffer);

                        summary.status = 'EMAILED';
                        summary.emailedAt = new Date();
                        await summary.save();
                    } catch (emailErr) {
                        console.error(`Failed to email slip to ${user.email}:`, emailErr);
                        batch.logs.push(`Email Failed User ${user._id}: ${emailErr.message}`);
                    }

                    processedCount++;
                    batchTotalPayout += summary.netSalary;

                } catch (userErr) {
                    console.error(`Failed to process user ${user._id}:`, userErr);
                    batch.logs.push(`Failed User ${user._id}: ${userErr.message}`);
                }
            }

            // Finish Batch
            batch.status = 'COMPLETED';
            batch.totalEmployeesProcessed = processedCount;
            batch.totalPayout = batchTotalPayout;
            await batch.save();
            console.log(`Batch Completed for ${branch.name}`);

        } catch (branchErr) {
            console.error(`Failed Batch for Branch ${branch._id}:`, branchErr);
            // Try to update batch status if it exists
            // (Logic omitted for brevity, assumed logged)
        }
    }
};

module.exports = { runMonthlyPayroll };
