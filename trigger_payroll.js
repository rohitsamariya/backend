async function triggerPayroll() {
    try {
        console.log('Triggering live payroll run-cycle...');
        // We use the Rohit Samariya branch ID from previous diagnostic: 699db642f873c27c57b390f0
        const res = await fetch('https://backend-29dt.onrender.com/api/payroll/run-cycle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.TEMP_ADMIN_TOKEN // I need a token
            },
            body: JSON.stringify({
                branchId: '699db642f873c27c57b390f0',
                month: 2,
                year: 2026
            })
        });
        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Data:', data);
    } catch (err) {
        console.error(err);
    }
}
// triggerPayroll(); 
console.log('Wait - I need an admin token to trigger this. I will skip the direct trigger and ask the user to click "RUN BRANCH CYCLE" again.');
