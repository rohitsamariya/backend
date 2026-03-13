async function testApi() {
    try {
        console.log('Testing forgot-password API...');
        const res = await fetch('http://localhost:5000/api/auth/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: 'rohitsamariya90@gmail.com' })
        });
        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Data:', data);
    } catch (err) {
        console.error('Fetch Error:', err);
    }
}

testApi();
