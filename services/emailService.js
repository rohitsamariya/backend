const nodemailer = require('nodemailer');
const User = require('../models/User');

/**
 * Configure Transporter (Hostinger)
 */
let transporter = null;

const getTransporter = () => {
    if (transporter) return transporter;

    const port = parseInt(process.env.SMTP_PORT) || 465;
    console.log(`[EmailService] Initializing transporter with host: ${process.env.SMTP_HOST || 'smtp.hostinger.com'}, port: ${port}`);

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.hostinger.com',
        port: port,
        secure: port === 465,
        auth: {
            user: process.env.SMTP_USER || 'noreply@hrmscompany.com',
            pass: process.env.SMTP_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    // Verify connection configuration
    transporter.verify((error, success) => {
        if (error) {
            console.error('[EmailService] SMTP Connection Error:', error);
        } else {
            console.log('[EmailService] SMTP Server is ready to take our messages');
        }
    });

    return transporter;
};

/**
 * Generic Lifecycle Email Dispatcher
 * @param {Object} user User Document
 * @param {String} type Email type (INVITE, REGISTRATION, STEP_X, COMPLETION, REMINDER)
 * @param {String} subject Email Subject
 * @param {String} html HTML Content
 * @param {Array} attachments Optional Attachments
 */
const sendLifecycleEmail = async (user, type, subject, html, attachments = []) => {
    try {
        // 1. Prevent Duplicates for same type (except REMINDER, INVITE, and RESET_PASSWORD)
        const skipTypes = ['REMINDER', 'INVITE', 'RESET_PASSWORD'];
        if (!skipTypes.includes(type) && user.emailHistory && user.emailHistory.some(h => h.emailType === type && h.status === 'SUCCESS')) {
            console.log(`Email type ${type} already sent to ${user.email}. Skipping.`);
            return;
        }

        const transporter = getTransporter();
        const fromEmail = process.env.SMTP_USER || 'noreply@hrmscompany.com';
        const fromName = process.env.FROM_NAME || 'HRMS Company';

        const message = {
            from: `"${fromName}" <${fromEmail}>`,
            to: user.email,
            replyTo: fromEmail,
            subject: subject || 'HR Notification',
            html: html,
            attachments: attachments
        };

        console.log(`[EmailService] Attempting to send ${type} email to ${user.email}...`);
        const info = await transporter.sendMail(message);
        console.log(`[EmailService] ${type} email sent successfully to: ${user.email}. MessageId: ${info.messageId}`);
        console.log(`Accepted: ${info.accepted}, Rejected: ${info.rejected}`);

        // 2. Audit Log to User Model
        await User.findByIdAndUpdate(user._id, {
            $push: {
                emailHistory: {
                    emailType: type,
                    sentAt: new Date(),
                    smtpResponse: info.messageId,
                    status: 'SUCCESS'
                }
            }
        });

        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error(`Lifecycle ${type} email failed for ${user.email}:`, error);

        // Log failure if user exists
        if (user && user._id) {
            await User.findByIdAndUpdate(user._id, {
                $push: {
                    emailHistory: {
                        emailType: type,
                        sentAt: new Date(),
                        smtpResponse: error.message,
                        status: 'FAILED'
                    }
                }
            }).catch(e => console.error('Failed to log email error:', e));
        }

        throw error;
    }
};

/**
 * Legacy support / specialized wrappers
 */
const sendEmail = async (options) => {
    const transporter = getTransporter();
    const fromName = process.env.FROM_NAME || 'HRMS Company';
    const message = {
        from: `"${fromName}" <${process.env.SMTP_USER || 'noreply@hrmscompany.com'}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
    };
    await transporter.sendMail(message);
};

const sendWelcomeEmail = async (user, branch, shift) => {
    const { generateWelcomeEmail } = require('./emailTemplates/welcomeTemplate');
    const html = generateWelcomeEmail(user, branch, shift);
    await sendLifecycleEmail(user, 'COMPLETION', `Welcome to ${process.env.FROM_NAME || 'HRMS Company'} – Onboarding Complete`, html);
};

const sendOfferInvite = async (invite, registrationLink, branchName, shiftName) => {
    // Note: OfferInvite might not be a 'User' yet in the old flow. 
    // For the NEW flow, we create a shell user with status INVITED.
    const { generateOfferInviteEmail } = require('./emailTemplates/offerInviteTemplate');
    const html = generateOfferInviteEmail(invite, registrationLink, branchName, shiftName);

    // Check if user exists for this email to use Lifecycle log
    const user = await User.findOne({ email: invite.email });
    if (user) {
        await sendLifecycleEmail(user, 'INVITE', 'You’re Invited to Join HRMS Company', html);
    } else {
        // Fallback for legacy without logging to user History
        const transporter = getTransporter();
        await transporter.sendMail({
            from: `"HRMS Company" <${process.env.SMTP_USER || 'noreply@hrmscompany.com'}>`,
            to: invite.email,
            subject: 'You’re Invited to Join HRMS Company',
            html: html
        });
    }
};

const sendViolationReportEmail = async (user, report, month, year) => {
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    // Generate HTML for violations list
    const violationRows = report.details.map(v => {
        let color = '#333';
        if (v.type === 'LATE') color = 'orange';
        if (v.type === 'EARLY_EXIT') color = 'purple';
        if (v.type === 'HALF_DAY') color = '#b45309'; // yellow-700
        if (v.type === 'ABSENT') color = 'red';

        return `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${v.date}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: ${color};">${v.type}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${v.time || v.duration || '-'}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1>Attendance Violation Report</h1>
                <p>Month: ${monthName} ${year}</p>
            </div>
            <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
                <p>Hello ${user.name},</p>
                <p>This is a summary of your attendance violations for <strong>${monthName} ${year}</strong>.</p>
                
                <div style="display: flex; justify-content: space-around; margin: 20px 0; background-color: #f9fafb; padding: 15px; border-radius: 8px;">
                    <div style="text-align: center;">
                        <span style="display: block; font-size: 20px; font-weight: bold; color: orange;">${report.totalLate}</span>
                        <span style="font-size: 12px; color: #666;">Late</span>
                    </div>
                    <div style="text-align: center;">
                        <span style="display: block; font-size: 20px; font-weight: bold; color: purple;">${report.totalEarlyExit}</span>
                        <span style="font-size: 12px; color: #666;">Early</span>
                    </div>
                     <div style="text-align: center;">
                        <span style="display: block; font-size: 20px; font-weight: bold; color: #b45309;">${report.totalHalfDays}</span>
                        <span style="font-size: 12px; color: #666;">Half Day</span>
                    </div>
                     <div style="text-align: center;">
                        <span style="display: block; font-size: 20px; font-weight: bold; color: red;">${report.totalAbsents}</span>
                        <span style="font-size: 12px; color: #666;">Absent</span>
                    </div>
                </div>

                <h3>Detailed Breakdown</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f3f4f6; text-align: left;">
                            <th style="padding: 8px;">Date</th>
                            <th style="padding: 8px;">Violation</th>
                            <th style="padding: 8px;">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${violationRows}
                    </tbody>
                </table>

                <p style="margin-top: 20px; font-size: 12px; color: #888;">
                    If you believe there is an error, please contact HR/Admin to regularize your attendance.
                </p>
            </div>
            <div style="text-align: center; padding: 10px; font-size: 12px; color: #aaa;">
                &copy; ${year} HRMS System. All rights reserved.
            </div>
        </div>
    `;

    return await sendLifecycleEmail(user, 'VIOLATION_REPORT', `Attendance Violations: ${monthName} ${year}`, html);
};

const sendAutoCheckoutEmail = async (user, dateStr, checkOutTimeStr) => {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #ef4444; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 20px;">Notice: Auto-Checkout Applied</h1>
            </div>
            <div style="padding: 20px; color: #374151;">
                <p>Hello ${user.name},</p>
                <p>This email is to notify you that the system automatically checked you out for your shift on <strong>${dateStr}</strong>.</p>
                <p>The system did not record a check-out punch within 2 hours after your scheduled shift end. Therefore, your check-out time has been automatically set to <strong>${checkOutTimeStr}</strong> (your scheduled shift end time), and an <strong>Auto-Checkout Violation</strong> has been recorded on your profile.</p>
                <p style="margin-top: 20px;"><strong>Note:</strong> Auto-Checkout violations are part of the daily attendance discipline policy and count towards half-day penalties similarly to late arrivals and early exits.</p>
                <p>Please remember to check out at the end of your shift moving forward.</p>
            </div>
            <div style="background-color: #f9fafb; padding: 10px; text-align: center; font-size: 12px; color: #6b7280;">
                &copy; ${process.env.FROM_NAME || 'HRMS Company'}
            </div>
        </div>
    `;
    return await sendLifecycleEmail(user, 'AUTO_CHECKOUT', 'Notice: Auto-Checkout Applied', html);
};

module.exports = { sendEmail, sendWelcomeEmail, sendOfferInvite, sendLifecycleEmail, sendViolationReportEmail, sendAutoCheckoutEmail };
