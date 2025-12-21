# License Server Setup

This application includes license validation that checks with a remote server to control access.

## How It Works

1. **License Activation**: Users enter a license key when first launching the app
2. **Remote Validation**: The app validates the license key with your server
3. **Caching**: Valid licenses are cached for 24 hours to reduce server load
4. **Periodic Checks**: The app re-validates the license every 24 hours
5. **Remote Revocation**: You can revoke access by marking a license as invalid on your server

## License Server API

Your license server should provide a POST endpoint that accepts:

**Request:**
```json
{
  "licenseKey": "USER_LICENSE_KEY",
  "machineId": "hostname",
  "appVersion": "1.0.0"
}
```

**Response (Valid License):**
```json
{
  "valid": true,
  "userName": "John Doe",
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Response (Invalid License):**
```json
{
  "valid": false,
  "error": "License key not found" // or "License expired", "License revoked", etc.
}
```

## Configuration

Set the license server URL using an environment variable:

```bash
export LICENSE_SERVER_URL=https://your-server.com/api/validate
```

Or update the `LICENSE_SERVER_URL` constant in `main/license-manager.js`.

## Development Mode

To disable license checking during development, set:

```bash
export DISABLE_LICENSE_CHECK=true
```

## Implementation Notes

- License keys are encrypted and stored in the app's user data directory
- The app has a 7-day offline grace period if the server is unreachable
- All major operations (scraping, mating calculator) check license validity
- License validation is performed on startup and periodically (every 24 hours)


