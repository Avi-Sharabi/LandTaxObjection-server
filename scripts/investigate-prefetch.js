require('dotenv').config();
const { Client } = require('pg');
const client = new Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

async function run() {
  await client.connect();

  // What does property_sales_raw look like for AV78825 (KNIGHT PL)?
  const r1 = await client.query(
    `SELECT id, dealing_number, property_house_number, property_street_name,
            property_locality, district_code, zoning, nature_of_property, primary_purpose,
            purchase_price, area, contract_date::date
     FROM property_sales_raw WHERE dealing_number = 'AV78825'`
  );
  console.log('=== property_sales_raw for AV78825 (KNIGHT PL) ===');
  console.table(r1.rows);

  // What sale_id values are stored in our most recent comparable_sales records?
  const r2 = await client.query(
    `SELECT cs.id, cs.sale_id, cs.dealing_number, cs.property_house_number,
            cs.property_street_name, cs.district_code, cs.purchase_price, cs.area,
            cs.contract_date::date, cs.adjusted_rate_per_sqm
     FROM comparable_sales cs
     ORDER BY cs.created_at DESC
     LIMIT 20`
  );
  console.log('\n=== Most recent comparable_sales rows (our develop output) ===');
  console.table(r2.rows);

  await client.end();
}

run().catch(err => { console.error(err.message); process.exit(1); });
