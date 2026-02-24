const generateStepCompletionEmail = (name, stepName, stepsRemaining, resumeLink) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px; }
        .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { font-size: 12px; color: #777; margin-top: 20px; text-align: center; }
        .badge { background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Onboarding Progress Update</h2>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            <p>Great job! You've successfully completed the following onboarding step:</p>
            <p><span class="badge">${stepName}</span></p>
            <p>You have <strong>${stepsRemaining}</strong> more steps to complete before you are fully onboarded.</p>
            <p style="text-align: center;">
                <a href="${resumeLink}" class="button">Continue Onboarding</a>
            </p>
            <p>Keep going!</p>
        </div>
        <div class="footer">
            <p>&copy; 2026 HRMS Company. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = { generateStepCompletionEmail };
