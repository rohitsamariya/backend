const nodemailer = require('nodemailer');
const { generatePayslipPDF } = require('./payslipPdfService');
const PayrollSummary = require('../../models/PayrollSummary');
const User = require('../../models/User');

/**
 * Service to handle payroll-related emails
 */
class PayrollEmailService {
    constructor() {
        const port = parseInt(process.env.SMTP_PORT) || 465;
        console.log(`[PayrollEmailService] Initializing transporter with host: ${process.env.SMTP_HOST || 'smtp.hostinger.com'}, port: ${port}`);
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.hostinger.com',
            port: port,
            secure: port === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            family: 4,
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    /**
     * Send payslip to employee
     * @param {string} payrollId 
     */
    async sendPayslipEmail(payrollId) {
        const payroll = await PayrollSummary.findById(payrollId).populate('user', 'name email');
        if (!payroll) throw new Error('Payroll record not found');
        if (!payroll.user || !payroll.user.email) throw new Error('Employee email not found');

        const pdfBuffer = await generatePayslipPDF(payrollId);

        const mailOptions = {
            from: `"HR Payroll" <${process.env.SMTP_USER}>`,
            to: payroll.user.email,
            subject: `Payslip for ${this.getMonthName(payroll.month)} ${payroll.year}`,
            text: `Dear ${payroll.user.name},\n\nPlease find attached your payslip for ${this.getMonthName(payroll.month)} ${payroll.year}.\n\nBest Regards,\nHR Team`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #2563eb;">Employee Payslip</h2>
                    <p>Dear <strong>${payroll.user.name}</strong>,</p>
                    <p>Please find attached your payslip for <strong>${this.getMonthName(payroll.month)} ${payroll.year}</strong>.</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Period:</strong> ${this.getMonthName(payroll.month)} ${payroll.year}</p>
                        <p style="margin: 0;"><strong>Net Salary:</strong> ₹${payroll.netSalary.toLocaleString('en-IN')}</p>
                    </div>
                    <p>Best Regards,<br>HR Team</p>
                </div>
            `,
            attachments: [
                {
                    filename: `Payslip_${payroll.user.name.replace(/\s+/g, '_')}_${payroll.month}_${payroll.year}.pdf`,
                    content: pdfBuffer
                }
            ]
        };

        const info = await this.transporter.sendMail(mailOptions);

        // Update payroll record
        payroll.emailSent = true;
        payroll.emailSentAt = new Date();
        await payroll.save();

        return info;
    }

    getMonthName(month) {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[month - 1];
    }
}

module.exports = new PayrollEmailService();
