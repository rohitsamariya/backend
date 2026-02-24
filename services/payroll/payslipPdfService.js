/**
 * Payslip PDF Generator — using PDFKit
 * 
 * Generates a formatted payslip PDF with:
 * - Company header
 * - Earnings (left column)
 * - Deductions (right column)
 * - Net pay highlight
 * - Amount in words
 * - Statutory flags
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const { getPayslipData } = require('./salaryEngine');

const FONT_REGULAR = path.join(__dirname, '../../assets/fonts/arial.ttf');
const FONT_BOLD = path.join(__dirname, '../../assets/fonts/arialbd.ttf');

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Format currency with Rupee symbol
 */
function fmt(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
        currencyDisplay: 'symbol'
    }).format(amount || 0);
}

/**
 * Generate payslip PDF
 * @param {string} payrollId - PayrollSummary ObjectId
 * @returns {Buffer} PDF buffer
 */
async function generatePayslipPDF(payrollId) {
    const data = await getPayslipData(payrollId);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Register fonts
        let fontRegular = 'Helvetica';
        let fontBold = 'Helvetica-Bold';

        try {
            doc.registerFont('Main', FONT_REGULAR);
            doc.registerFont('Main-Bold', FONT_BOLD);
            fontRegular = 'Main';
            fontBold = 'Main-Bold';
        } catch (e) {
            console.error('Font loading failed, falling back to standard fonts:', e);
        }

        doc.font(fontRegular);

        const pageWidth = doc.page.width - 80; // margins
        const colWidth = pageWidth / 2;
        const leftX = 40;
        const rightX = 40 + colWidth + 20;

        // ══════════════════════════════
        // HEADER
        // ══════════════════════════════
        doc.fontSize(18).font(fontBold).text('PAYSLIP', leftX, 40, { align: 'center' });
        doc.fontSize(10).font(fontRegular).text(
            `For the month of ${MONTHS[data.period.month]} ${data.period.year}`,
            leftX, 65, { align: 'center' }
        );

        // Divider
        doc.moveTo(leftX, 85).lineTo(leftX + pageWidth, 85).stroke();

        // ══════════════════════════════
        // EMPLOYEE DETAILS
        // ══════════════════════════════
        let y = 95;
        doc.fontSize(9).font(fontBold);
        doc.text('Employee Name:', leftX, y);
        doc.font(fontRegular).text(data.employee.name || '-', leftX + 110, y);

        doc.font(fontBold).text('Branch:', rightX, y);
        doc.font(fontRegular).text(data.branch || '-', rightX + 100, y);

        y += 18;
        doc.font(fontBold).text('Loss of Pay (LOP):', leftX, y);
        doc.font(fontRegular).text(
            `${data.attendance.lop} Days`,
            leftX + 110, y
        );

        doc.font(fontBold).text('PAN:', rightX, y);
        doc.font(fontRegular).text(data.employee.pan || '-', rightX + 100, y);

        if (data.attendance.showLeaves || data.attendance.availableLeaves > 0) {
            y += 18;
            doc.font(fontBold).text('Balance Leaves:', leftX, y);
            doc.font(fontRegular).text(
                `${data.attendance.availableLeaves}`,
                leftX + 110, y
            );
        }

        // Divider
        y += 25;
        doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).stroke();
        y += 10;

        // ══════════════════════════════
        // EARNINGS & DEDUCTIONS (Two columns)
        // ══════════════════════════════
        doc.fontSize(11).font(fontBold);
        doc.text('EARNINGS', leftX, y);
        doc.text('DEDUCTIONS', rightX, y);

        y += 5;
        doc.moveTo(leftX, y + 13).lineTo(leftX + colWidth - 10, y + 13).stroke();
        doc.moveTo(rightX, y + 13).lineTo(rightX + colWidth - 10, y + 13).stroke();
        y += 20;

        const earnings = [
            ['Basic Salary', data.earnings.basic],
            ['Dearness Allowance', data.earnings.da],
            ['House Rent Allowance', data.earnings.hra],
            ['Special Allowance', data.earnings.specialAllowance],
            ['Other Allowances', data.earnings.otherAllowances],
        ];

        if (data.earnings.arrears > 0) {
            earnings.push(['Arrears', data.earnings.arrears]);
        }

        const deductions = [
            ['Employee PF', data.deductions.employeePF],
            ['Professional Tax', data.deductions.professionalTax],
            ['Tax Deducted (TDS)', data.deductions.tds],
        ];

        if (data.deductions.lopDeduction > 0) {
            deductions.push(['LOP Deduction', data.deductions.lopDeduction]);
        }

        doc.fontSize(9).font(fontRegular);
        const maxRows = Math.max(earnings.length, deductions.length);

        for (let i = 0; i < maxRows; i++) {
            if (i < earnings.length) {
                doc.text(earnings[i][0], leftX, y);
                doc.text(fmt(earnings[i][1]), leftX + colWidth - 110, y, { width: 100, align: 'right' });
            }
            if (i < deductions.length) {
                doc.text(deductions[i][0], rightX, y);
                doc.text(fmt(deductions[i][1]), rightX + colWidth - 110, y, { width: 100, align: 'right' });
            }
            y += 16;
        }

        // Totals
        y += 5;
        doc.moveTo(leftX, y).lineTo(leftX + colWidth - 10, y).stroke();
        doc.moveTo(rightX, y).lineTo(rightX + colWidth - 10, y).stroke();
        y += 8;

        doc.font(fontBold);
        doc.text('Gross Salary', leftX, y);
        doc.text(fmt(data.earnings.grossSalary), leftX + colWidth - 110, y, { width: 100, align: 'right' });
        doc.text('Total Deductions', rightX, y);
        doc.text(fmt(data.deductions.totalDeductions), rightX + colWidth - 110, y, { width: 100, align: 'right' });

        // ══════════════════════════════
        // NET SALARY
        // ══════════════════════════════
        y += 30;
        doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).stroke();
        y += 10;

        doc.fontSize(14).font(fontBold);
        doc.text('NET PAY', leftX, y);
        doc.text(fmt(data.netSalary), leftX + 100, y, { width: pageWidth - 100, align: 'right' });

        // Amount in words
        y += 25;
        doc.fontSize(9).font(fontRegular); // Removed Oblique as Arial doesn't have it by default without italic font
        doc.text(data.netSalaryInWords, leftX, y, { width: pageWidth });

        // ══════════════════════════════
        // EMPLOYER COSTS
        // ══════════════════════════════
        y += 30;
        doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).stroke();
        y += 10;

        doc.fontSize(9).font(fontBold).text('EMPLOYER CONTRIBUTIONS', leftX, y);
        y += 18;

        doc.font(fontRegular);
        doc.text('Employer PF:', leftX, y);
        doc.text(fmt(data.employerCosts.employerPF), leftX + 150, y);
        y += 16;
        doc.text('Admin Charges:', leftX, y);
        doc.text(fmt(data.employerCosts.adminCharges), leftX + 150, y);
        doc.text('Cost to Company:', rightX, y);
        doc.font(fontBold).text(fmt(data.employerCosts.costToCompany), rightX + 150, y);

        // ══════════════════════════════
        // CALCULATION LOG (Transparency - Requirement 8)
        // ══════════════════════════════
        y += 35;
        doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).stroke();
        y += 10;
        doc.fontSize(10).font(fontBold).text('CALCULATION LOG (TRANSPARENCY)', leftX, y);
        y += 18;

        const log = data.calculationLog ? JSON.parse(data.calculationLog) : null;
        if (log) {
            doc.fontSize(8).font(fontRegular);
            const logItems = [
                ['Probation Status', log.probationStatus],
                ['Working Days in Month', log.workingDaysInMonth],
                ['Daily Rate', `₹${log.dailyRate}`],
                ['Leaves Used', `${log.leaveAndLop.leaveUsed} Days`],
                ['LOP Days', `${log.leaveAndLop.lopDays} Days`],
                ['Arrears Added', `₹${log.arrears.amount}`]
            ];

            logItems.forEach(item => {
                doc.font(fontBold).text(`${item[0]}:`, leftX, y);
                doc.font(fontRegular).text(`${item[1]}`, leftX + 150, y);
                y += 14;
            });
        }

        // ══════════════════════════════
        // FOOTER
        // ══════════════════════════════
        y += 20;
        doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).stroke();
        y += 10;
        doc.fontSize(7).font(fontRegular).fillColor('#666666');
        doc.text('This is a system-generated payslip. Generated on: ' + new Date().toLocaleDateString('en-IN'), leftX, y);
        doc.text('Status: ' + (data.status === 'SUPERSEDED' ? 'SUPERSEDED (Revised)' : data.status), leftX, y + 10);

        doc.end();
    });
}

module.exports = { generatePayslipPDF };
