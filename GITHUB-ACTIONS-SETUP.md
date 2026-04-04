# GitHub Actions Auto-Deployment to Hostinger

This guide sets up automatic deployment whenever you push to GitHub.

## Step 1: Push to GitHub

Create a repository on GitHub and push your code:

```powershell
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/parish-connect.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 2: Get Your Hostinger FTP Credentials

1. **Login to Hostinger Dashboard** (hpanel.hostinger.com)
2. **Navigate to Files > FTP Accounts**
3. **Create or use existing FTP account**
4. Record these three values:
   - **FTP Server**: Usually `ftp.yourdomain.com` or IP from Hostinger
   - **FTP Username**: Your FTP username
   - **FTP Password**: Your FTP password

💡 **Tip**: If you have multiple domains, make sure you're using the FTP account for your main domain.

---

## Step 3: Add GitHub Secrets

1. **Go to GitHub Repository Settings**
   - https://github.com/YOUR_USERNAME/parish-connect/settings
   
2. **Click "Secrets and variables" → "Actions"**

3. **Create 3 new repository secrets**:

| Secret Name | Value |
|---|---|
| `HOSTINGER_FTP_SERVER` | Your FTP server host (e.g., `ftp.sanvicenteferrerparish-franciscan.com`) |
| `HOSTINGER_FTP_USER` | Your FTP username |
| `HOSTINGER_FTP_PASSWORD` | Your FTP password |

**Add them one by one:**
- Click "New repository secret"
- Enter name and value
- Click "Add secret"

---

## Step 4: Test the Deployment

1. **Make a small change** to your code (e.g., edit README.md)

2. **Commit and push**:
   ```powershell
   git add .
   git commit -m "Test deployment"
   git push
   ```

3. **Watch the deployment**:
   - Go to GitHub repo → **Actions** tab
   - Click the latest workflow run
   - Watch real-time logs
   - Should complete in 2-5 minutes

✅ **Success**: Your app is now live on Hostinger!

---

## Step 5: Verify Deployment

After successful deployment, verify:

1. **Frontend**: https://sanvicenteferrerparish-franciscan.com/parish-connect/
2. **API Health**: https://sanvicenteferrerparish-franciscan.com/parish-connect/api/health

Should see:
- Login page with background image ✓
- `{"success": true, "message": "Parish Connect API is running"}` ✓

---

## Future Deployments

Now you just need to:

1. Make code changes locally
2. Commit and push to GitHub:
   ```powershell
   git add .
   git commit -m "Your message"
   git push
   ```
3. **Done!** GitHub Actions automatically builds and deploys within 2 minutes

---

## Troubleshooting

**Deployment fails with "Connection refused"?**
- Check FTP credentials are correct in GitHub secrets
- Verify FTP server is active in Hostinger dashboard
- Make sure port is open (usually 21)

**Files not updating on production?**
- Clear browser cache (Ctrl+Shift+Delete)
- Check GitHub Actions logs for errors
- Verify FTP deployment target path is correct

**Need to redeploy without code changes?**
- Edit this file: `.github/workflows/deploy.yml`
- Add a comment and push
- Or manually re-run workflow from Actions tab

---

## Disable Auto-Deployment (Optional)

To pause automatic deployments:
1. Go to `.github/workflows/deploy.yml`
2. Change `branches: [main, master]` to `branches: []`
3. Commit and push

---

**Questions?** Check GitHub Actions logs at: https://github.com/YOUR_USERNAME/parish-connect/actions
