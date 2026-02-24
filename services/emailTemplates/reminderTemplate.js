const generateReminderEmail = (name, completedCount, remainingCount, resumeLink) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { font-size: 12px; color: #777; margin-top: 20px; text-align: center; }
        .stats { background: #fee2e2; padding: 15px; border-radius: 8px; margin: 15px 0; font-weight: bold; color: #b91c1c; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Reminder: Complete Your Onboarding</h2>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            <p>We noticed that you haven't finished your onboarding process yet.</p>
            <div class="stats">
                Current Progress: ${completedCount} steps completed, ${remainingCount} steps remaining.
            </div>
            <p>Completing these steps is mandatory to finalize your employment records and get your login ID / reporting details.</p>
            <p style="text-align: center;">
                <a href="${resumeLink}" class="button">Resume Onboarding Now</a>
            </p>
            <p>If you face any technical issues, please reach out to the HR Helpdesk.</p>
        </div>
        <div class="footer">
            <p>&copy; 2026 HRMS Company. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = { generateReminderEmail };
