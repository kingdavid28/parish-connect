# Parish Connect - Deployment Guide

## 🚀 Pre-Deployment Checklist

- [x] Frontend built: `dist/` folder ready
- [x] API configured: `.env` file with production settings
- [x] Database configured: `u222318185_parish_connect`
- [x] Environment variables: `VITE_API_BASE_URL` configured
- [x] Background image: `/public/background-viewport.png` ready
- [x] Admin credentials: Setup script ready

---

## 📋 Deployment Steps

### Step 1: Access Your Hostinger Control Panel

1. Log in to your Hostinger account
2. Navigate to **File Manager** or **cPanel**
3. You should see your `public_html` folder

### Step 2: Upload Frontend (dist/)

**Destination:** `public_html/parish-connect/`

1. Create folder: `parish-connect` (if not exists)
2. Upload **contents of `dist/` folder**:
   - `index.html`
   - `assets/` folder (with all CSS, JS, PNG files)

**Important:** Upload the **contents** of `dist/`, not the `dist` folder itself.

```
public_html/
├── parish-connect/
│   ├── index.html
│   └── assets/
│       ├── index-*.css
│       ├── index-*.js
│       └── parish-connect-logo-*.png
```

### Step 3: Upload API (api/)

**Destination:** `public_html/parish-connect/api/`

1. Create folder: `api` inside `parish-connect/`
2. Upload these files to `public_html/parish-connect/api/`:
   - `index.php`
   - `config.php`
   - `db.php`
   - `.env` (production version with your credentials)
   - `routes/` folder (auth.php, users.php, posts.php, records.php)
   - `middleware/` folder
   - `vendor/` folder (PHP dependencies)
   - Other supporting files

**DO NOT upload:**
- `.git/` or `.gitignore`
- `node_modules/` (server-side PHP doesn't need Node.js)
- `setup-admin.php` (remove after initial setup)

### Step 4: Verify Environment Setup

**Frontend:** `public_html/parish-connect/.env` (if needed)
```
VITE_API_BASE_URL=https://sanvicenteferrerparish-franciscan.com/parish-connect/api
```

**API:** `public_html/parish-connect/api/.env`
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=u222318185_parish
DB_PASSWORD=kNooCkk@0228a
DB_NAME=u222318185_parish_connect
JWT_SECRET=458bc90a669499c0924018605dc3db932affc47f692b9c25b7f7d5999379c2ec64bf06c4c376a7bdc1835fb0cd43b0356b859d9bd586017d1c3bdb372b4204bf
JWT_EXPIRES_IN=7d
ALLOWED_ORIGINS=https://sanvicenteferrerparish-franciscan.com
```

### Step 5: Configure .htaccess for Vite SPA

Create `public_html/parish-connect/.htaccess`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  
  # Don't rewrite static files and folders
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  
  # Rewrite all routes to index.html for SPA routing
  RewriteRule ^ index.html [QSA,L]
</IfModule>
```

### Step 6: Test API Connectivity

Visit these URLs to verify:

1. **Health Check:**
   ```
   https://sanvicenteferrerparish-franciscan.com/parish-connect/api/health
   ```
   Expected response:
   ```json
   {"success": true, "message": "Parish Connect API is running"}
   ```

2. **Database Test:**
   ```
   https://sanvicenteferrerparish-franciscan.com/parish-connect/api/db-test
   ```
   Expected response:
   ```json
   {"success": true, "message": "Database connected", "db": "u222318185_parish_connect"}
   ```

### Step 7: Test Frontend

Visit:
```
https://sanvicenteferrerparish-franciscan.com/parish-connect/
```

You should see:
- Login page with background image
- Parish Connect logo
- Sign in form

### Step 8: Test Login

Credentials (from setup-admin.php):
- **Email:** `reycelrcentino@gmail.com`
- **Password:** `kNooCkk@0228a`

Expected behavior:
- ✅ Login succeeds
- ✅ Redirected to Feed page
- ✅ Background image visible
- ✅ Navbar displays user info
- ✅ Can navigate to other pages

---

## 🔄 Deployment Using FTP (Detailed Steps)

If using FTP client (FileZilla, WinSCP, etc.):

### 1. Connect to Your Server
- **Host:** `ftp.sanvicenteferrerparish-franciscan.com`
- **Username:** Your Hostinger FTP username
- **Password:** Your Hostinger FTP password
- **Port:** 21 (or 22 for SFTP)

### 2. Navigate and Create Folders
```
/
├── public_html/
│   ├── parish-connect/           ← Create this folder
│   │   ├── index.html            ← Upload from dist/
│   │   ├── assets/               ← Upload from dist/assets/
│   │   ├── .htaccess             ← Create this file
│   │   └── api/                  ← Create this folder
│   │       ├── index.php         ← Upload from api/
│   │       ├── .env              ← Upload from api/
│   │       ├── routes/           ← Upload from api/routes/
│   │       ├── middleware/       ← Upload from api/middleware/
│   │       └── vendor/           ← Upload from api/vendor/
```

### 3. Upload Files
- Drag `dist/*` into `parish-connect/`
- Drag `api/*` into `parish-connect/api/`

---

## 🐛 Troubleshooting

### Issue: "Cannot find module" or API returns 500 error
**Solution:** Ensure `vendor/` folder is uploaded (contains autoload.php)

### Issue: "Database connection failed"
**Solution:** 
1. Verify `.env` has correct DB credentials
2. Check if database `u222318185_parish_connect` exists
3. Test connection via phpMyAdmin

### Issue: "CORS error" in browser console
**Solution:** 
1. Verify `ALLOWED_ORIGINS` in `api/.env`
2. Ensure it matches your domain exactly

### Issue: Static files (CSS, JS) not loading
**Solution:**
1. Check that `assets/` folder is in `parish-connect/`
2. Verify file permissions (755 for folders, 644 for files)
3. Clear browser cache (Ctrl+Shift+Delete)

### Issue: Images not loading
**Solution:**
1. Verify `/public/background-viewport.png` is accessible
2. Check that `parish-connect-logo.png` is in `assets/`
3. Update image paths if needed

---

## 📝 Post-Deployment Steps

1. **Remove Test Files**
   - Delete `setup-admin.php` from `parish-connect/api/`
   - Delete any `.env.example` files

2. **Security Hardening**
   - Disable directory listing: Add to `.htaccess`
     ```apache
     Options -Indexes
     ```
   - Restrict API access to necessary methods only

3. **Enable HTTPS**
   - Your domain should have SSL (HTTPS)
   - Redirect HTTP to HTTPS

4. **Monitor Logs**
   - Check error logs in Hostinger cPanel
   - Monitor database access

5. **Backup**
   - Create a backup of your database
   - Export a copy of public_html/parish-connect/

---

## 📊 File Checklist for Upload

### Frontend (dist/ folder)
- [ ] `index.html`
- [ ] `assets/index-*.css`
- [ ] `assets/index-*.js`
- [ ] `assets/parish-connect-logo-*.png`

### API (api/ folder)
- [ ] `index.php`
- [ ] `config.php`
- [ ] `db.php`
- [ ] `.env` (production)
- [ ] `routes/auth.php`
- [ ] `routes/users.php`
- [ ] `routes/posts.php`
- [ ] `routes/records.php`
- [ ] `middleware/auth.php`
- [ ] `vendor/` (entire folder with autoload.php)

### Configuration Files
- [ ] `public_html/parish-connect/.htaccess` (create new)
- [ ] `public_html/parish-connect/api/.env` (upload)

### Static Assets
- [ ] `public/background-viewport.png` (if not in dist/assets/)

---

## 🔗 Important URLs After Deployment

- **Frontend:** https://sanvicenteferrerparish-franciscan.com/parish-connect/
- **API Base:** https://sanvicenteferrerparish-franciscan.com/parish-connect/api
- **Health Check:** https://sanvicenteferrerparish-franciscan.com/parish-connect/api/health
- **Login Endpoint:** POST https://sanvicenteferrerparish-franciscan.com/parish-connect/api/auth/login

---

## 💡 Quick Reference

**Build command:** `npm run build`
**Output folder:** `dist/`
**API folder:** `api/`
**Environment:** `production`
**Database:** MySQL 5.7+
**PHP Version:** 7.4+

---

For support, refer to the [IMPLEMENTATION.md](../IMPLEMENTATION.md) and [README.md](../README.md) files.
