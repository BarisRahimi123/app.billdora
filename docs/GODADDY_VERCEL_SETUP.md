# Domain Setup Guide: GoDaddy + Vercel

## Overview
This guide helps you connect your GoDaddy domain (`billdora.com`) to Vercel for hosting `app.billdora.com`.

---

## Step 1: Deploy to Vercel

1. **Push your code to GitHub** (if not already)
2. **Go to [vercel.com](https://vercel.com)** and sign in
3. **Import your repository**:
   - Click "Add New" → "Project"
   - Select your GitHub repo
   - Configure build settings:
     - Framework: Vite
     - Build Command: `npm run build`
     - Output Directory: `dist`
4. **Add Environment Variables** in Vercel:
   - Go to Project Settings → Environment Variables
   - Add:
     ```
     VITE_SUPABASE_URL = https://bqxnagmmegdbqrzhheip.supabase.co
     VITE_SUPABASE_ANON_KEY = your-anon-key
     ```
5. **Deploy** - Vercel will give you a URL like `your-project.vercel.app`

---

## Step 2: Add Custom Domain in Vercel

1. **In Vercel Dashboard** → Your Project → Settings → Domains
2. **Add domain**: `app.billdora.com`
3. Vercel will show you DNS records to configure:
   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```

---

## Step 3: Configure DNS in GoDaddy

1. **Login to GoDaddy** → My Products → DNS
2. **Find your domain** `billdora.com` → Manage DNS
3. **Add CNAME record**:
   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | CNAME | app | cname.vercel-dns.com | 1 Hour |

4. **Save changes**

---

## Step 4: Verify & SSL

1. **Wait 5-30 minutes** for DNS propagation
2. **Go back to Vercel** Domains settings
3. Vercel will automatically:
   - Verify the domain
   - Issue SSL certificate
   - Show ✅ green checkmark when ready

4. **Test**: Visit `https://app.billdora.com`

---

## Troubleshooting

### Domain not verifying?
- Check DNS propagation: https://dnschecker.org/#CNAME/app.billdora.com
- Ensure no conflicting A records for `app` subdomain

### SSL issues?
- Vercel handles SSL automatically
- Wait up to 24 hours for certificate issuance

### Still using old site?
- Clear browser cache
- Try incognito/private window

---

## Post-Deployment Checklist

- [ ] Rotate Supabase API keys (old ones exposed in git history)
- [ ] Update Supabase Dashboard → Settings → API → Allowed URLs to include `https://app.billdora.com`
- [ ] Test all app functionality on new domain
- [ ] Update any OAuth providers (Google, Apple) with new redirect URLs
