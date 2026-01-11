# Group Migration Instructions

## Issue
The "Route not found" error occurs because the Group and GroupMember tables don't exist in the database yet.

## Solution: Run Migration

You need to create and apply a migration for the new Group and GroupMember tables.

### Step 1: Create Migration Locally

In PowerShell (in the `backend` folder):

```powershell
cd backend
npx prisma@5.7.1 migrate dev --name add_groups
```

This will:
- Create migration files for Group and GroupMember tables
- Apply them to your Railway database
- Update the database schema

### Step 2: Commit Migration Files

After migration completes:

```powershell
cd ..
git add backend/prisma/migrations
git commit -m "Add migration for groups and group members"
git push
```

### Step 3: Verify

After pushing:
1. Railway will automatically redeploy
2. The healthcheck should pass
3. Groups API should work

## What Gets Created

- **Group table**: For storing user groups
- **GroupMember table**: For storing group members (name, phone number)
- **Relations**: Groups linked to Users, Members linked to Groups

## Troubleshooting

If migration fails:
- Check that `.env` file has correct DATABASE_URL (public URL from Railway)
- Verify database is accessible
- Check Railway logs for errors
