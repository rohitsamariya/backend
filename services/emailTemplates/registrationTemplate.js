const generateRegistrationEmail = (name, loginLink) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px; }
        .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #10b981; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { font-size: 12px; color: #777; margin-top: 20px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Account Created Successfully</h2>
        </div>
        <div class="content">
            <p>Hello ${name},</p>
            <p>Your account at ${process.env.FROM_NAME || 'HRMS Company'} has been created successfully!</p>
            <p>To access your personal dashboard and manage your work, please use the login link below:</p>
            <p style="text-align: center;">
                <a href="${loginLink}" class="button">Log In to Your Account</a>
            </p>
            <p>Welcome to the family!</p>
        </div>
        <div class="footer">
            <p>&copy; 2026 ${process.env.FROM_NAME || 'HRMS Company'}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = { generateRegistrationEmail };
