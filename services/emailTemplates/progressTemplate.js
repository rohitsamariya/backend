const generateProgressSavedEmail = (name, stepName, stepNumber, resumeLink) => {
    return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #4f46e5;">Onboarding Progress Saved</h2>
            <p>Hello ${name},</p>
            <p>Your onboarding progress has been successfully saved. You have reached <strong>Step ${stepNumber}: ${stepName}</strong>.</p>
            
            <p>You can return at any time to complete the remaining steps by clicking the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resumeLink}" style="background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Resume Onboarding</a>
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="color: #666; font-size: 12px;">${resumeLink}</p>
            
            <br>
            <p>Best Regards,</p>
            <p><strong>${process.env.FROM_NAME || 'HRMS Company'} Team</strong></p>
        </div>
    `;
};

module.exports = { generateProgressSavedEmail };
