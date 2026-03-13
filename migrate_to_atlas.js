const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '.env') });

const localUri = 'mongodb://127.0.0.1:27017/hrms_attendance';
const atlasUri = process.env.MONGO_URI;

async function migrate() {
    console.log('🔌 Connecting to Local MongoDB...');
    const localConn = await mongoose.createConnection(localUri).asPromise();
    console.log('✅ Local DB connected');

    console.log('🔌 Connecting to Atlas MongoDB...');
    const atlasConn = await mongoose.createConnection(atlasUri).asPromise();
    console.log('✅ Atlas DB connected');

    const db = localConn.db;
    const collections = await db.listCollections().toArray();
    console.log(`\n📦 Found ${collections.length} collections to migrate:\n`);

    let totalDocs = 0;

    for (const col of collections) {
        const name = col.name;
        const localCol = localConn.db.collection(name);
        const atlasCol = atlasConn.db.collection(name);

        const docs = await localCol.find({}).toArray();
        if (docs.length === 0) {
            console.log(`  ⏭️  ${name}: empty, skipping`);
            continue;
        }

        // Clear existing atlas collection first to avoid duplicates
        await atlasCol.deleteMany({});

        // Insert in batches of 500
        const batchSize = 500;
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = docs.slice(i, i + batchSize);
            await atlasCol.insertMany(batch, { ordered: false });
        }

        console.log(`  ✅ ${name}: ${docs.length} documents migrated`);
        totalDocs += docs.length;
    }

    console.log(`\n🎉 Migration complete! Total: ${totalDocs} documents across ${collections.length} collections`);

    await localConn.close();
    await atlasConn.close();
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
