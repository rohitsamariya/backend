const PayrollSummary = require('../models/PayrollSummary');
const SalaryStructure = require('../models/payroll/SalaryStructure');
const PayrollCycle = require('../models/payroll/PayrollCycle');
const PFContribution = require('../models/payroll/PFContribution');
const ESIContribution = require('../models/payroll/ESIContribution');
const TDSRecord = require('../models/payroll/TDSRecord');
const ProfessionalTaxRecord = require('../models/payroll/ProfessionalTaxRecord');
const StatutoryConfig = require('../models/payroll/StatutoryConfig');
const TaxSlab = require('../models/payroll/TaxSlab');
const ProfessionalTaxSlab = require('../models/payroll/ProfessionalTaxSlab');
const InvestmentDeclaration = require('../models/payroll/InvestmentDeclaration');
const User = require('../models/User');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const salaryEngine = require('../services/payroll/salaryEngine');
const { generatePayslipPDF } = require('../services/payroll/payslipPdfService');
const { invalidateCache } = require('../services/payroll/configLoader');
const emailService = require('../services/payroll/payrollEmailService');

// ══════════════════════════════════════════════════
// PAYROLL CYCLE
// ══════════════════════════════════════════════════

// @desc    Run payroll for a branch
// @route   POST /api/payroll/run-cycle
// @access  ADMIN
exports.runCycle = async (req, res) => {
    try {
        const { branchId, month, year } = req.body;
        if (!branchId || !month || !year) {
            return res.status(400).json({ success: false, error: 'branchId, month, year are required' });
        }

        const m = parseInt(month);
        const y = parseInt(year);

        // 1. We now allow re-running even if already processed/finalized.
        // It will overwrite existing summaries and reset email flags.

        // 2. Trigger Calculation
        const cycle = await salaryEngine.runBranchPayroll(branchId, m, y, req.user._id);

        if (cycle.processed > 0) {
            // 3. Lock/Finalize processed records (Simplified: Update status to FINALIZED)
            await PayrollSummary.updateMany(
                { branch: branchId, month: m, year: y, status: 'PROCESSED' },
                { status: 'FINALIZED', finalizedAt: new Date(), finalizedBy: req.user._id }
            );

            // 4. Update cycle status
            cycle.status = 'PROCESSED + SENT';
            await cycle.save();
        }

        res.status(200).json({
            success: true,
            message: `Payroll calculations completed: ${cycle.processed} processed, ${cycle.failed} failed. Payslips are being dispatched in the background.`,
            data: cycle
        });
    } catch (error) {
        console.error('Run cycle error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server Error' });
    }
};

// @desc    Process single employee payroll
// @route   POST /api/payroll/process/:userId
// @access  ADMIN, HR
exports.processEmployee = async (req, res) => {
    try {
        const { userId } = req.params;
        const { month, year } = req.body;
        if (!month || !year) return res.status(400).json({ success: false, error: 'month and year required' });

        const result = await salaryEngine.processEmployee(userId, parseInt(month), parseInt(year));
        res.status(200).json({ success: true, data: result.data, skipped: result.skipped });
    } catch (error) {
        console.error('Process employee error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server Error' });
    }
};

// @desc    Get employee payrolls for branch/month (Unified Register)
// @route   GET /api/payroll
// @access  ADMIN, HR
exports.listPayroll = async (req, res) => {
    try {
        const { branchId, month, year, page = 1, limit = 10 } = req.query;

        const m = parseInt(month);
        const y = parseInt(year);
        const pSize = parseInt(limit);
        const skip = (parseInt(page) - 1) * pSize;

        // Target End Date (Last day of selected month)
        const tz = 'Asia/Kolkata';
        const targetEnd = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: tz }).endOf('month').toUTC().toJSDate();

        // 1. Build User Query (Employees who joined on or before target month)
        let userQuery = {
            status: 'ACTIVE',
            role: 'EMPLOYEE',
            createdAt: { $lte: targetEnd }
        };

        if (req.user.role === 'HR') userQuery.branch = req.user.branch;
        else if (branchId) userQuery.branch = branchId;

        // 2. Fetch Users (Paginated)
        const total = await User.countDocuments(userQuery);
        const users = await User.find(userQuery)
            .select('name employeeId department email monthlyCTC branch createdAt profileImage')
            .populate('branch', 'name')
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(pSize);

        // 3. Fetch the specific PayrollSummary records for the selected month
        const userIds = users.map(u => u._id);
        const currentMonthRecords = await PayrollSummary.find({
            user: { $in: userIds },
            month: m,
            year: y,
            status: { $ne: 'SUPERSEDED' }
        }).select('_id user status emailSent netSalary totalDeductions generatedAt').lean();



        const currentMonthMap = {};
        currentMonthRecords.forEach(r => {
            currentMonthMap[r.user.toString()] = r;
        });

        // 4. Merge Data (Reflecting current month metrics)
        const data = users.map(user => {
            const currentRecord = currentMonthMap[user._id.toString()];
            const isFullyProcessed = currentRecord && (currentRecord.status === 'FINALIZED' || currentRecord.status === 'PROCESSED');

            return {
                user,
                joiningDate: user.createdAt,
                monthlyCTC: user.monthlyCTC,
                netSalary: currentRecord ? currentRecord.netSalary : 0,
                totalDeductions: currentRecord ? currentRecord.totalDeductions : 0,
                processedAt: currentRecord ? currentRecord.generatedAt : null,
                payrollId: currentRecord ? currentRecord._id : null,
                emailSent: currentRecord ? currentRecord.emailSent : false,
                status: isFullyProcessed ? 'PROCESSED + SENT' : 'PENDING'
            };
        });

        res.status(200).json({
            success: true,
            count: total,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / pSize)
            },
            data
        });
    } catch (error) {
        console.error('List payroll error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get full payroll detail
// @route   GET /api/payroll/:id
// @access  ADMIN, HR, EMPLOYEE
exports.getPayrollDetail = async (req, res) => {
    try {
        const payroll = await PayrollSummary.findById(req.params.id)
            .populate('user', 'name employeeId department panNumber uanNumber email')
            .populate('branch', 'name timezone');

        if (!payroll) return res.status(404).json({ success: false, error: 'Payroll record not found' });

        res.status(200).json({ success: true, data: payroll });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get payslip data
// @route   GET /api/payroll/payslip/:id
// @access  ADMIN, HR, EMPLOYEE
exports.getPayslip = async (req, res) => {
    try {
        const payslip = await salaryEngine.getPayslipData(req.params.id);
        res.status(200).json({ success: true, data: payslip });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message || 'Server Error' });
    }
};

// @desc    Finalize payroll (manual action)
// @route   PUT /api/payroll/:id/finalize
// @access  ADMIN
exports.finalizePayroll = async (req, res) => {
    try {
        const payroll = await PayrollSummary.findById(req.params.id);
        if (!payroll) return res.status(404).json({ success: false, error: 'Not found' });
        if (payroll.status === 'FINALIZED') return res.status(400).json({ success: false, error: 'Already finalized' });

        payroll.status = 'FINALIZED';
        payroll.finalizedAt = new Date();
        payroll.finalizedBy = req.user._id;
        await payroll.save();

        res.status(200).json({ success: true, data: payroll });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Finalize entire cycle
// @route   PUT /api/payroll/finalize-cycle/:cycleId
// @access  ADMIN
exports.finalizeCycle = async (req, res) => {
    try {
        const cycle = await PayrollCycle.findById(req.params.cycleId);
        if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });

        // Finalize all payrolls in this cycle
        await PayrollSummary.updateMany(
            { payrollCycle: cycle._id, status: 'PROCESSED' },
            { status: 'FINALIZED', finalizedAt: new Date(), finalizedBy: req.user._id }
        );

        cycle.status = 'FINALIZED';
        cycle.lockedBy = req.user._id;
        cycle.lockedAt = new Date();
        await cycle.save();

        res.status(200).json({ success: true, data: cycle });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ══════════════════════════════════════════════════
// SALARY STRUCTURE
// ══════════════════════════════════════════════════

// @desc    Create/update salary structure
// @route   POST /api/payroll/salary-structure/:userId
// @access  ADMIN, HR
exports.saveSalaryStructure = async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            basic, da, hra, specialAllowance, otherAllowances,
            pfOptedOut, taxRegime, effectiveFrom,
            applyImmediately = false
        } = req.body;

        if (!basic || basic <= 0) return res.status(400).json({ success: false, error: 'Basic salary is required and must be > 0' });

        const grossSalary = (basic || 0) + (da || 0) + (hra || 0) + (specialAllowance || 0) + (otherAllowances || 0);

        // Deactivate previous active structure
        await SalaryStructure.updateMany(
            { user: userId, isActive: true },
            { isActive: false, effectiveTo: effectiveFrom || new Date() }
        );

        // Get version
        const lastVersion = await SalaryStructure.findOne({ user: userId }).sort({ version: -1 });
        const version = lastVersion ? lastVersion.version + 1 : 1;

        const structure = await SalaryStructure.create({
            user: userId,
            basic, da: da || 0, hra: hra || 0,
            specialAllowance: specialAllowance || 0,
            otherAllowances: otherAllowances || 0,
            grossSalary,
            annualCTC: grossSalary * 12,
            monthlyCTC: grossSalary,
            pfOptedOut: pfOptedOut || false,
            taxRegime: taxRegime || 'NEW',
            effectiveFrom: effectiveFrom || new Date(),
            isActive: true,
            version,
            createdBy: req.user._id
        });

        // Update user's monthlyCTC
        await User.findByIdAndUpdate(userId, { monthlyCTC: grossSalary });

        // Apply immediately: Recalculate current month's payroll if it exists and is not finalized
        if (applyImmediately) {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            const existing = await PayrollSummary.findOne({ user: userId, month, year });
            if (existing && existing.status !== 'FINALIZED') {
                await salaryEngine.processEmployee(userId, month, year);
            }
        }

        res.status(200).json({ success: true, data: structure });
    } catch (error) {
        console.error('Save salary structure error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get salary structure
// @route   GET /api/payroll/salary-structure/:userId
// @access  ADMIN, HR
exports.getSalaryStructure = async (req, res) => {
    try {
        const structure = await SalaryStructure.findOne({ user: req.params.userId, isActive: true })
            .sort({ effectiveFrom: -1 });
        res.status(200).json({ success: true, data: structure });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ══════════════════════════════════════════════════
// STATUTORY REPORTS
// ══════════════════════════════════════════════════

// @desc    Get statutory compliance report
// @route   GET /api/payroll/statutory-report
// @access  ADMIN
exports.getStatutoryReport = async (req, res) => {
    try {
        const { branchId, month, year } = req.query;
        if (!month || !year) return res.status(400).json({ success: false, error: 'month, year required' });

        const m = parseInt(month), y = parseInt(year);
        const branchMatch = branchId ? { branch: new mongoose.Types.ObjectId(branchId) } : {};

        const [pfSummary, esiSummary, tdsSummary, ptSummary, payrollSummary] = await Promise.all([
            // EPF Summary
            PFContribution.aggregate([
                { $match: { month: m, year: y, ...branchMatch } },
                {
                    $group: {
                        _id: null,
                        totalEmployeePF: { $sum: '$employeePF' },
                        totalEmployerEPS: { $sum: '$employerEPS' },
                        totalEmployerEPF: { $sum: '$employerEPF' },
                        totalEmployerTotal: { $sum: '$employerTotal' },
                        totalContribution: { $sum: '$totalContribution' },
                        totalAdminCharges: { $sum: '$adminCharges' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // ESI Summary
            ESIContribution.aggregate([
                { $match: { month: m, year: y, ...branchMatch } },
                {
                    $group: {
                        _id: null,
                        totalEmployeeESI: { $sum: '$employeeContribution' },
                        totalEmployerESI: { $sum: '$employerContribution' },
                        totalContribution: { $sum: '$totalContribution' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // TDS Summary
            TDSRecord.aggregate([
                { $match: { month: m, year: y, ...branchMatch } },
                {
                    $group: {
                        _id: null,
                        totalMonthlyTDS: { $sum: '$monthlyTDS' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // PT Summary
            ProfessionalTaxRecord.aggregate([
                { $match: { month: m, year: y, ...branchMatch } },
                {
                    $group: {
                        _id: null,
                        totalPT: { $sum: '$ptAmount' },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Overall Payroll Summary
            PayrollSummary.aggregate([
                { $match: { month: m, year: y, ...branchMatch } },
                {
                    $group: {
                        _id: null,
                        totalGross: { $sum: '$grossSalary' },
                        totalDeductions: { $sum: '$totalDeductions' },
                        totalNetPay: { $sum: '$netSalary' },
                        totalCTC: { $sum: '$costToCompany' },
                        avgNetSalary: { $avg: '$netSalary' },
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        res.status(200).json({
            success: true,
            data: {
                period: { month: m, year: y },
                payroll: payrollSummary[0] || {},
                epf: pfSummary[0] || {},
                esi: esiSummary[0] || {},
                tds: tdsSummary[0] || {},
                professionalTax: ptSummary[0] || {}
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get branch payroll summary
// @route   GET /api/payroll/branch-summary
// @access  HR, ADMIN
exports.getBranchSummary = async (req, res) => {
    try {
        const { branchId, month, year } = req.query;
        if (!month || !year) return res.status(400).json({ success: false, error: 'month, year required' });

        const summary = await PayrollSummary.aggregate([
            {
                $match: {
                    branch: new mongoose.Types.ObjectId(branchId),
                    month: parseInt(month), year: parseInt(year)
                }
            },
            {
                $group: {
                    _id: null,
                    totalPayout: { $sum: '$netSalary' },
                    totalDeductions: { $sum: '$totalDeductions' },
                    totalGross: { $sum: '$grossSalary' },
                    totalCTC: { $sum: '$costToCompany' },
                    count: { $sum: 1 },
                    avgNetSalary: { $avg: '$netSalary' }
                }
            }
        ]);

        res.status(200).json({ success: true, data: summary[0] || { totalPayout: 0, count: 0 } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ══════════════════════════════════════════════════
// CONFIGURATION / SEED
// ══════════════════════════════════════════════════

// @desc    Seed statutory defaults
// @route   POST /api/payroll/seed-config
// @access  ADMIN
exports.seedConfig = async (req, res) => {
    try {
        // Statutory Config
        await StatutoryConfig.findOneAndUpdate(
            { key: 'default' },
            {
                key: 'default',
                financialYear: '2025-26',
                isActive: true,
                effectiveFrom: new Date('2025-04-01')
            },
            { upsert: true, new: true }
        );

        // Tax Slabs — New Regime
        await TaxSlab.findOneAndUpdate(
            { regime: 'NEW', financialYear: '2025-26' },
            {
                regime: 'NEW', financialYear: '2025-26', isActive: true,
                slabs: [
                    { from: 0, to: 300000, rate: 0 },
                    { from: 300000, to: 700000, rate: 5 },
                    { from: 700000, to: 1000000, rate: 10 },
                    { from: 1000000, to: 1200000, rate: 15 },
                    { from: 1200000, to: 1500000, rate: 20 },
                    { from: 1500000, to: null, rate: 30 }
                ]
            },
            { upsert: true, new: true }
        );

        // Tax Slabs — Old Regime
        await TaxSlab.findOneAndUpdate(
            { regime: 'OLD', financialYear: '2025-26' },
            {
                regime: 'OLD', financialYear: '2025-26', isActive: true,
                slabs: [
                    { from: 0, to: 250000, rate: 0 },
                    { from: 250000, to: 500000, rate: 5 },
                    { from: 500000, to: 1000000, rate: 20 },
                    { from: 1000000, to: null, rate: 30 }
                ]
            },
            { upsert: true, new: true }
        );

        // PT Slabs — Maharashtra
        await ProfessionalTaxSlab.findOneAndUpdate(
            { state: 'Maharashtra', financialYear: '2025-26' },
            {
                state: 'Maharashtra', financialYear: '2025-26', isActive: true,
                maxAnnual: 2500,
                slabs: [
                    { from: 0, to: 7500, monthly: 0, february: 0 },
                    { from: 7501, to: 10000, monthly: 175, february: 175 },
                    { from: 10001, to: null, monthly: 200, february: 300 }
                ]
            },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, message: 'Statutory config seeded successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get statutory config
// @route   GET /api/payroll/config
// @access  ADMIN
exports.getConfig = async (req, res) => {
    try {
        const [config, newSlabs, oldSlabs, ptSlabs] = await Promise.all([
            StatutoryConfig.findOne({ key: 'default', isActive: true }),
            TaxSlab.findOne({ regime: 'NEW', isActive: true }),
            TaxSlab.findOne({ regime: 'OLD', isActive: true }),
            ProfessionalTaxSlab.find({ isActive: true })
        ]);

        res.status(200).json({
            success: true,
            data: { config, taxSlabs: { new: newSlabs, old: oldSlabs }, ptSlabs }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get payroll cycles
// @route   GET /api/payroll/cycles
// @access  ADMIN
exports.getCycles = async (req, res) => {
    try {
        const { branchId, month, year } = req.query;
        let query = {};
        if (branchId) query.branch = branchId;
        if (month) query.month = parseInt(month);
        if (year) query.year = parseInt(year);

        const cycles = await PayrollCycle.find(query)
            .populate('branch', 'name')
            .populate('initiatedBy', 'name')
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({ success: true, data: cycles });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Download payslip as PDF
// @route   GET /api/payroll/:id/payslip-pdf
// @access  ADMIN, HR, EMPLOYEE
exports.downloadPayslipPDF = async (req, res) => {
    try {
        const pdfBuffer = await generatePayslipPDF(req.params.id);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=payslip-${req.params.id}.pdf`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ success: false, error: error.message || 'PDF generation failed' });
    }
};

// @desc    Recalculate payroll
// @route   POST /api/payroll/:id/recalculate
// @access  ADMIN, HR
exports.recalculatePayroll = async (req, res) => {
    try {
        const payroll = await PayrollSummary.findById(req.params.id);
        if (!payroll) return res.status(404).json({ success: false, error: 'Payroll record not found' });

        // We now allow recalculation even if status is FINALIZED.
        // It will overwrite and reset email flags.

        const result = await salaryEngine.processEmployee(payroll.user.toString(), payroll.month, payroll.year);

        if (!result.skipped && result.data) {
            // Requirement 6: Finalize and Send updated email notification
            const newPayroll = await PayrollSummary.findById(result.data._id);
            newPayroll.status = 'FINALIZED';
            newPayroll.finalizedAt = new Date();
            newPayroll.finalizedBy = req.user._id;
            await newPayroll.save();

            // Send Email
            await emailService.sendPayslipEmail(newPayroll._id).catch(e => console.error("Email failed on recalculate:", e));
        }

        // Sync parent cycle totals if exists
        const cycle = await PayrollCycle.findOne({ branch: payroll.branch, month: payroll.month, year: payroll.year });
        if (cycle) {
            await salaryEngine.syncCycleTotals(cycle._id);
        }

        res.status(200).json({ success: true, data: result.data });
    } catch (error) {
        console.error('Recalculate error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server Error' });
    }
};

// @desc    Send email payslip
// @route   POST /api/payroll/:id/send-email
// @access  ADMIN, HR
exports.sendEmailPayslip = async (req, res) => {
    try {
        await emailService.sendPayslipEmail(req.params.id);
        res.status(200).json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({ success: false, error: error.message || 'Email sending failed' });
    }
};
