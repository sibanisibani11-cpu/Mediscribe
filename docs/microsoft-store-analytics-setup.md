# Microsoft Store acquisition sync

The in-app Admin page keeps three independent measurements: app first opens and sessions,
Microsoft Store acquisitions, and GitHub installer downloads. They overlap and must not be
added together as unique people. Website links hosted on GitHub are included in GitHub's
counts; separately hosted files need analytics from their hosting provider.

## One-time account setup

In Partner Center, open Account settings > Users > Microsoft Entra applications.
Associate your Entra directory if needed, add an application with the Manager role,
then open it to obtain Tenant ID, Client ID, and Add new key (the secret VALUE).
Find your Store ID in your product's Product management > Product identity page.

Store these settings in ~/.config/mediscribe/partner-center.env, OUTSIDE the project:

```dotenv
PC_TENANT_ID=
PC_CLIENT_ID=
PC_CLIENT_SECRET=
PC_STORE_ID=
PC_START_DATE=2025-01-01
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/firebase-service-account.json
```

Set PC_START_DATE to your app's launch date. PC_END_DATE is optional (defaults to today).
Do not put these credentials in the project's .env: the desktop build packages that file.
The Firebase service account must have permission to write analytics_sources/microsoft_store.
Keep this collection's writes restricted to trusted admin/server credentials.

Run `npm run sync:msstore` on the developer computer or trusted server, then refresh the
Admin page. The command replaces one complete snapshot; repeated runs cannot double-count.
Failed requests preserve the previous snapshot. Store data may arrive later than app events.
This command is not automatically scheduled. A trusted scheduled job can invoke it daily.

The integration uses Microsoft's documented appacquisitions API. Availability depends on
your Store product/account; a live credentialed request is required to confirm support.

References:
- https://learn.microsoft.com/en-us/windows/uwp/monetize/access-analytics-data-using-windows-store-services
- https://learn.microsoft.com/en-us/windows/uwp/monetize/get-app-acquisitions
