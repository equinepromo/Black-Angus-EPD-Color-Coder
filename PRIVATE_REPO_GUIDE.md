# Private Repository Auto-Update Guide

## Important: GitHub Limitation

**You CANNOT make individual releases public in a private GitHub repository.** This is a GitHub platform limitation, not a configuration issue.

## The Problem

- Private repositories: All releases are private by default
- electron-updater: Cannot authenticate to access private releases
- Result: Auto-updates will **NOT work** with private repos

## Your Options

### Option 1: Make Repository Public (Recommended for Auto-Updates)

**Pros:**
- ✅ Auto-updates work perfectly
- ✅ Easy distribution
- ✅ No authentication needed
- ✅ Better discoverability

**Cons:**
- ⚠️ Source code is visible

**How to Protect Sensitive Code:**
1. Use `.gitignore` to exclude sensitive files
2. Store secrets in environment variables (never commit them)
3. Use a separate private repo for sensitive code
4. Only include production-ready code in the public repo

**Steps:**
1. Go to your repository settings
2. Scroll down to "Danger Zone"
3. Click "Change visibility" → "Make public"
4. Confirm the change

### Option 2: Keep Private, Manual Updates Only

**Pros:**
- ✅ Source code stays private
- ✅ Users can still download installers

**Cons:**
- ❌ Auto-updates will NOT work
- ⚠️ Users must manually download new versions

**How It Works:**
1. Create releases as normal (they'll be private)
2. Share direct download links with users
3. Users download and install manually
4. No automatic update checking

**Getting Direct Download Links:**
1. Go to your release page
2. Right-click on the installer file
3. Copy the link address
4. Share with users (they can download even from private repos if they have the direct link)

### Option 3: Use Personal Access Token (Not Recommended)

**Warning:** This requires distributing tokens to users, which is a security risk.

**How It Works:**
1. Create a GitHub Personal Access Token with `repo` scope
2. Set `GH_TOKEN` environment variable on user machines
3. Configure electron-updater to use the token

**Why Not Recommended:**
- ⚠️ Security risk (tokens grant repository access)
- ⚠️ Complex to distribute securely
- ⚠️ Users must manage tokens
- ⚠️ Tokens can be revoked/expired

**If You Must Use This:**
```javascript
// In update-manager.js
autoUpdater.setRequestHeaders({
  'Authorization': `token ${process.env.GH_TOKEN}`
});
```

### Option 4: Use a Different Update Server

Instead of GitHub Releases, you could:
- Host updates on your own server
- Use a CDN (CloudFlare, AWS S3, etc.)
- Use a dedicated update service

This requires more setup but gives you full control.

## Recommendation

**For Auto-Updates:** Make your repository public. This is the simplest and most reliable solution.

**To Protect Your Code:**
1. Review what's in your repository
2. Remove any sensitive information (API keys, passwords, etc.)
3. Use `.gitignore` for files you don't want to share
4. Consider splitting into public (app) and private (sensitive) repos

## Current Status Check

To check if your repo is public or private:
1. Go to: `https://github.com/equinepromo/Black-Angus-EPD-Color-Coder`
2. Look at the repository visibility indicator (usually near the repository name)
3. If it shows a lock icon 🔒, it's private
4. If there's no lock icon, it's public

## Making Your Repository Public

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Scroll down to **Danger Zone** section
4. Click **Change visibility**
5. Select **Make public**
6. Type your repository name to confirm
7. Click **I understand, change repository visibility**

**Note:** Once public, anyone can see your code. Make sure you've removed any sensitive information first!

## After Making Public

1. Your existing releases will become public
2. Auto-updates will start working immediately
3. New releases will be public by default
4. Users can browse releases without authentication

## FAQ

**Q: Can I make just the releases public while keeping the repo private?**
A: No, this is not possible on GitHub. Releases inherit the repository's visibility.

**Q: Will making it public expose my license server code?**
A: Yes, if it's in the repository. Consider moving sensitive code to a separate private repo.

**Q: Can I use a private repo for code and public repo just for releases?**
A: Yes! You can:
- Keep source code in a private repo
- Build and publish releases to a separate public repo
- Update `package.json` to point to the public repo for releases

**Q: What about GitHub Pro/Team accounts?**
A: Even with paid accounts, you cannot make individual releases public in a private repository.
