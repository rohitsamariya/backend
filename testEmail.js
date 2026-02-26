require('dotenv').config();
const nodemailer = require('nodemailer');

const testEmail = async () => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.hostinger.com',
            port: parseInt(process.env.SMTP_PORT) || 465,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        console.log('Transporter configuration:', {
            host: process.env.SMTP_HOST || 'smtp.hostinger.com',
            port: parseInt(process.env.SMTP_PORT) || 465,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: '***HIDDEN***'
            }
        });

        const info = await transporter.sendMail({
            from: `"${process.env.FROM_NAME || 'Cortexa Global'}" <${process.env.SMTP_USER}>`,
            to: 'rsamariya50@gmail.com', // Let's send a test directly to user
            subject: 'Test Email from Node',
            text: 'This is a test email to debug the SMTP issue.'
        });

        console.log('✅ Email sent securely:', info.messageId);
        process.exit(0);
    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

testEmail();
