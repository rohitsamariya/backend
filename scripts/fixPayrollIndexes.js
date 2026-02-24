require('dotenv').config();
const mongoose = require('mongoose');

const TARGET_COLLECTION = 'payrollsummaries';
const LEGACY_INDEX_NAME = 'user_1_month_1_year_1';
const NEW_INDEX_NAME = 'user_1_month_1_year_1_active_unique';

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set');
  }

  console.log('[fixPayrollIndexes] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[fixPayrollIndexes] Connected');

  const db = mongoose.connection.db;
  const collection = db.collection(TARGET_COLLECTION);

  const indexes = await collection.indexes();
  const indexNames = indexes.map(i => i.name);
  console.log(`[fixPayrollIndexes] Existing indexes: ${indexNames.join(', ')}`);

  // 1) Drop legacy full unique index if present
  if (indexNames.includes(LEGACY_INDEX_NAME)) {
    const legacy = indexes.find(i => i.name === LEGACY_INDEX_NAME);
    const isLegacyFullUnique = legacy?.unique === true && !legacy?.partialFilterExpression;

    if (isLegacyFullUnique) {
      console.log(`[fixPayrollIndexes] Dropping legacy full unique index: ${LEGACY_INDEX_NAME}`);
      await collection.dropIndex(LEGACY_INDEX_NAME);
      console.log('[fixPayrollIndexes] Legacy index dropped');
    } else {
      console.log(`[fixPayrollIndexes] Index ${LEGACY_INDEX_NAME} exists but is not legacy full-unique. Skipping drop.`);
    }
  } else {
    console.log('[fixPayrollIndexes] Legacy index not found. Nothing to drop.');
  }

  // 2) Ensure target partial unique index exists
  const refreshed = await collection.indexes();
  const existingNew = refreshed.find(i => i.name === NEW_INDEX_NAME);

  const expectedPartial = {
    status: { $in: ['DRAFT', 'PROCESSED', 'FINALIZED', 'FAILED'] }
  };

  const hasExpectedNew =
    existingNew &&
    existingNew.unique === true &&
    JSON.stringify(existingNew.key) === JSON.stringify({ user: 1, month: 1, year: 1 }) &&
    JSON.stringify(existingNew.partialFilterExpression) === JSON.stringify(expectedPartial);

  if (hasExpectedNew) {
    console.log(`[fixPayrollIndexes] Target partial index already exists: ${NEW_INDEX_NAME}`);
  } else {
    if (existingNew) {
      console.log(`[fixPayrollIndexes] Existing ${NEW_INDEX_NAME} does not match expected definition. Dropping...`);
      await collection.dropIndex(NEW_INDEX_NAME);
    }

    console.log(`[fixPayrollIndexes] Creating partial unique index: ${NEW_INDEX_NAME}`);
    await collection.createIndex(
      { user: 1, month: 1, year: 1 },
      {
        name: NEW_INDEX_NAME,
        unique: true,
        partialFilterExpression: expectedPartial
      }
    );
    console.log('[fixPayrollIndexes] Partial unique index created');
  }

  const finalIndexes = await collection.indexes();
  console.log('[fixPayrollIndexes] Final indexes:');
  finalIndexes.forEach(idx => console.log(`  - ${idx.name} => key=${JSON.stringify(idx.key)} unique=${!!idx.unique} partial=${JSON.stringify(idx.partialFilterExpression || null)}`));

  await mongoose.disconnect();
  console.log('[fixPayrollIndexes] Done');
}

run().catch(async (err) => {
  console.error('[fixPayrollIndexes] Failed:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
