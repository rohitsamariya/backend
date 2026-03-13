async function testStatic() {
    try {
        console.log('Testing live static file access (public folder)...');
        const res = await fetch('https://backend-29dt.onrender.com/public/logo.png'); // assuming a logo exists in public
        console.log('Status /public/logo.png:', res.status);
        
        console.log('Testing live static file access (uploads folder)...');
        const res2 = await fetch('https://backend-29dt.onrender.com/uploads/profile-images/non-existent.jpg');
        console.log('Status /uploads/ (expected 404):', res2.status);
    } catch (err) {
        console.error(err);
    }
}
testStatic();
