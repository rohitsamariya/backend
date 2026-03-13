async function testLiveApi() {
    try {
        console.log('Testing live forgot-password API...');
        const res = await fetch('https://backend-29dt.onrender.com/api/auth/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://frontend-ljai.onrender.com'
            },
            body: JSON.stringify({ email: 'rohitsamariya90@gmail.com' })
        });
        const data = await res.json().catch(() => null);
        console.log('Status:', res.status);
        console.log('Headers:', res.headers);
        console.log('Data:', data);
    } catch (err) {
        console.error('Fetch Error:', err);
    }
}

testLiveApi();
