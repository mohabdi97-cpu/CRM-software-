# Relay CRM

Relay gives a sales operator two workspaces.

- **Data Lab** imports CSV, TSV and JSON. It keeps the original fields, suggests a normalized contact, and holds records for review. You can save a draft, dismiss and restore rows, or explicitly merge with an existing contact during promotion.
- **Sales CRM** displays full name, email, phone, business name, industry, and buying signals. The contact details let you record supporting evidence with a source, URL, observation date, and verification state.
- **Workspace settings** let you change the workspace name, add raw columns from the original file, and adjust automatic import aliases. Saved views remember search, filters, and sort. Each workspace can export the entire list or the current view.

Import suggestions are generated from supplied evidence. The contact details also offer a public company research link for operator-led discovery. The app starts with fictional sample data in the public demo. The private workspace starts empty.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
npm run build
npm run dev
npm test
```

The local app serves `http://127.0.0.1:4173`. Production builds use official Astryx Neutral theme assets, typography, and pre-rendered Astryx component markup. The browser uses native controls for interactions.

## Enable the private workspace

For a private local instance, set `CRM_LOCAL_DATA_PATH` to a private path for the data file. On Vercel, connect a **private** Vercel Blob store to this project. The app uses the linked `BLOB_STORE_ID` and Vercel OIDC, or an existing server-only `BLOB_READ_WRITE_TOKEN`. Keep production credentials and storage scoped to production.

1. Generate a random 32-byte base64url access key, then calculate its SHA-256 hex digest. Keep the original access key in your password manager.
2. Set `CRM_ACCESS_KEY_HASH` to the digest and `CRM_SESSION_SECRET` to a separate, randomly generated 32-byte or longer secret. Use sensitive environment variables on Vercel. Deploy again after changing them.
3. Select **Demo workspace** in the top bar and use the access key to sign in. Sessions last 30 days. Changing the access hash or signing secret invalidates existing sessions.

The workspace is single-owner, with version checks to prevent one tab from silently overwriting another. The current private storage model saves a workspace snapshot and supports up to 3.75 MB per write. For larger datasets, switch the storage adapter to a record-oriented database before importing production volumes.

## References

- [REA's complete-source inspection workflow](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md)
- [Twenty spreadsheet import steps](https://github.com/twentyhq/twenty/tree/main/packages/twenty-front/src/modules/spreadsheet-import/steps/components)
- [Twenty saved views](https://github.com/twentyhq/twenty/tree/main/packages/twenty-front/src/modules/views)
- [Meta Astryx design system](https://github.com/meta/astryx)
