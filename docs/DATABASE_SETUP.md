# Local PostgreSQL setup for the Casa Natural Instagram automation

## 1. Install the database client dependency

The project uses the Neon serverless PostgreSQL client:

- @neondatabase/serverless

This was chosen because it is a small, compatible fit for Netlify Functions and keeps the database access server-side.

## 2. Create a Neon database

1. Create a Neon project.
2. Copy the connection string.
3. Set it as the DATABASE_URL environment variable in your local environment.

## 3. Initialize the schema

From the project root, run:

```bash
node --input-type=module -e "import { initializeDatabase, seedDefaultCampaign } from './src/lib/postgresStore.js'; await initializeDatabase(); await seedDefaultCampaign(); console.log('schema ready');"
```

## 4. Local development

When DATABASE_URL is configured, the admin and webhook functions will connect to PostgreSQL directly.

If DATABASE_URL is missing, the functions fail clearly with an error instead of falling back to the previous JSON store.

## 5. Required environment variables

- DATABASE_URL
- ADMIN_PASSWORD
- META_ACCESS_TOKEN
- META_APP_SECRET
- META_VERIFY_TOKEN
- META_PAGE_ID
- META_INSTAGRAM_ACCOUNT_ID

Do not commit real credentials.
