# Deployment Guide

## Overview

Monkey Barrel deploys to Cloudflare Workers via GitHub Actions. Pushing to `main` triggers an automatic build and deploy.

## Prerequisites

- A Cloudflare account with Workers, Pages, and D1 enabled
- A GitHub repository for this project

## 1. Create a Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use the **Custom token** template
4. Grant these permissions:
   - **Account > Cloudflare Workers** -- Edit
   - **Account > D1** -- Edit
   - **Zone > Workers Routes** -- Edit (if using custom domains)
5. Set **Account Resources** to your account
6. Click **Continue to summary**, then **Create Token**
7. Copy the token (you will not see it again)

## 2. Add GitHub Repository Secrets

1. Go to your GitHub repo > **Settings** > **Secrets and variables** > **Actions**
2. Add two repository secrets:
   - `CLOUDFLARE_API_TOKEN` -- the API token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` -- found at the top of your Cloudflare dashboard URL or in Workers & Pages overview

## 3. First Deployment (Manual)

The first deploy must be done locally so Cloudflare creates the Worker, D1 database, and Durable Object namespaces:

```bash
# Build the project
bun run build

# Deploy to Cloudflare
wrangler deploy

# Run D1 migrations on the remote database
bun run db:migrate:prod
```

## 4. Subsequent Deployments (Automatic)

After the first manual deploy, every push to `main` triggers the GitHub Actions workflow at `.github/workflows/deploy.yml`. It will:

1. Install Bun
2. Run `bun install`
3. Run `bun run build`
4. Run `wrangler deploy`

## Production Secrets

To set secrets that the Worker can access at runtime (not checked into git):

```bash
wrangler secret put SECRET_NAME
```

These are separate from GitHub Actions secrets. GitHub secrets are for CI/CD authentication; Wrangler secrets are for Worker runtime access.

## D1 Database

The D1 database ID is in `wrangler.jsonc`. To run migrations against production:

```bash
bun run db:migrate:prod
```

To list your D1 databases:

```bash
wrangler d1 list
```
