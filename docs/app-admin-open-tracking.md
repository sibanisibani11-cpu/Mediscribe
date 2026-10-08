# App Admin Open Tracking

MediScribe now tracks app usage directly from the app and shows it inside the in-app Admin page.

Flow:

```text
User opens MediScribe
→ app writes a first-open record to Firestore `downloads`
→ app writes a launch/session record to Firestore `app_launches`
→ developer opens MediScribe Admin page
→ Admin page reads those records and shows First Opens / App Opens
```

Firebase is only the shared storage layer. The visible dashboard is the MediScribe Admin page inside the app.

Microsoft Partner Center acquisition sync is also retained, alongside GitHub installer
downloads. See [Microsoft Store setup](microsoft-store-analytics-setup.md). These source
totals are separate from first opens because they may describe the same installation.

## Collections

- `downloads`: one document per installation, counted as First Opens.
- `app_launches`: one document per app session, counted as App Opens.

## Firestore Rule Snippet

If anonymous/non-registered users are not appearing, add rules like this in Firebase Console under Firestore Rules. Keep your existing `users` rules; only add these two collection blocks.

```js
match /downloads/{installId} {
  allow create, update: if
    request.resource.data.app == "mediscribe" &&
    request.resource.data.event == "first_open" &&
    request.resource.data.installId is string &&
    request.resource.data.os is string &&
    request.resource.data.isGuest is bool;
}

match /app_launches/{sessionId} {
  allow create, update: if
    request.resource.data.app == "mediscribe" &&
    request.resource.data.event == "app_launch" &&
    request.resource.data.installId is string &&
    request.resource.data.sessionId is string &&
    request.resource.data.os is string &&
    request.resource.data.isGuest is bool;
}
```

Do not allow public reads for these collections. The Admin page reads them through the desktop admin path.
