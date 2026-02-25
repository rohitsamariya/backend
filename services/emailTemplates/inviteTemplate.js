const generateInviteEmail = (name, position, registrationLink) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px; }
        .header { background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { font-size: 12px; color: #777; margin-top: 20px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Welcome to ${process.env.FROM_NAME || 'HRMS Company'}</h2>
        </div>
        <div class="content">
            <p>Hello ${name},</p>
            <p>We are excited to invite you to join our team as a <strong>${position}</strong> at ${process.env.FROM_NAME || 'HRMS Company'}!</p>
            <p>To begin your onboarding process and set up your account, please click the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${registrationLink}" style="background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Join ${process.env.FROM_NAME || 'HRMS Company'}</a>
            </div>
            
            <p>This link will expire in 24 hours.</p>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="color: #666; font-size: 12px;">${registrationLink}</p>
            
            <p>Best Regards,</p>
            <p><strong>${process.env.FROM_NAME || 'HRMS Company'} Team</strong></p>
        </div>
        <div style="text-align: center; padding: 20px; font-size: 12px; color: #666;">
            <p>&copy; 2026 ${process.env.FROM_NAME || 'HRMS Company'}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = { generateInviteEmail };
