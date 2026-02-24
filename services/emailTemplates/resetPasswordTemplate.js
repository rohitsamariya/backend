/**
 * Generate Password Reset Email Template
 * @param {String} name User Name
 * @param {String} resetLink Password Reset Link
 * @returns {String} HTML Content
 */
const generateResetPasswordEmail = (name, resetLink) => {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Password Reset Request</h1>
            </div>
            <div style="padding: 24px; color: #374151; line-height: 1.6;">
                <p>Hello <strong>${name}</strong>,</p>
                <p>We received a request to reset your password for your HRMS account. Click the button below to set a new password:</p>
                
                <div style="text-align: center; margin: 32px 0;">
                    <a href="${resetLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                
                <p>This link will expire in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
                
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                
                <p style="font-size: 13px; color: #6b7280;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${resetLink}" style="color: #4f46e5; word-break: break-all;">${resetLink}</a>
                </p>
            </div>
            <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
                &copy; ${new Date().getFullYear()} HRMS System. All rights reserved.
            </div>
        </div>
    `;
};

module.exports = { generateResetPasswordEmail };
