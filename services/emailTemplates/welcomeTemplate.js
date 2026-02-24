const generateWelcomeEmail = (user, branch, shift) => {
    return `
        <h1>Welcome to the Team, ${user.name}!</h1>
        <p>We are excited to have you on board.</p>
        
        <h3>Your Employment Details:</h3>
        <ul>
            <li><strong>Role:</strong> ${user.role}</li>
            <li><strong>Branch:</strong> ${branch.name}</li>
            <li><strong>Location:</strong> ${branch.address}</li>
            <li><strong>Timezone:</strong> ${branch.timezone || 'UTC'}</li>
            <li><strong>Assigned Shift:</strong> ${shift.name} (${shift.startTime} - ${shift.endTime})</li>
        </ul>

        <p>Please log in to your dashboard to view your schedule and start marking attendance.</p>
        
        <p>If you have any questions, please contact HR.</p>
        
        <br>
        <p>Best Regards,</p>
        <p><strong>HR Team</strong></p>
    `;
};

module.exports = { generateWelcomeEmail };
