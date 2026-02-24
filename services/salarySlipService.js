const pdfService = require('./pdfService'); // Assuming this exists with createPDF
const salarySlipTemplate = require('./pdfTemplates/salarySlipTemplate');
const PayrollSummary = require('../models/PayrollSummary');
const User = require('../models/User');
const Branch = require('../models/Branch');

exports.generateSalarySlipPDF = async (payrollId) => {
    // 1. Fetch Data
    const payroll = await PayrollSummary.findById(payrollId)
        .populate('user', 'name role pfAccountNumber')
        .populate('branch', 'name'); // Branch name for header

    if (!payroll) throw new Error('Payroll record not found');
    if (payroll.status !== 'LOCKED') throw new Error('Payroll is not LOCKED. Cannot generate slip.');

    // 2. Prepare Data Object
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const data = {
        companyName: "HRMS Corp",
        branchName: payroll.branch.name,
        month: monthNames[payroll.month - 1],
        year: payroll.year,
        generatedDate: new Date(payroll.generatedAt).toLocaleDateString(),
        currency: "₹",
        employee: {
            name: payroll.user.name,
            id: payroll.user._id.toString().substring(20).toUpperCase(),
            role: payroll.user.role,
            pfAccount: payroll.user.pfAccountNumber,
            pan: payroll.user.panNumber,
            bankAccount: payroll.user.bankAccountNumber
        },
        earnings: {
            base: payroll.basicSalary,
            hra: payroll.hra,
            conveyance: payroll.conveyance,
            special: payroll.specialAllowance,
            gross: payroll.grossSalary
        },
        deductions: {
            pf: payroll.pfEmployee,
            pt: payroll.professionalTax,
            tds: payroll.tds,
            discipline: payroll.disciplineDeduction,
            total: payroll.totalDeductions
        },
        employerContribution: payroll.pfEmployer,
        netSalary: payroll.netSalary
    };

    // 3. Generate HTML
    const html = salarySlipTemplate(data);

    // 4. Generate PDF Buffer
    const pdfBuffer = await pdfService.createPDF(html);
    return pdfBuffer;
};
