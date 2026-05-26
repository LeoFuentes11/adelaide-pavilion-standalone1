# Adelaide Pavilion — Standalone Server

Self-hosted Node.js website. No Vercel required.

## Requirements

- Node.js 18 or higher
- npm

## First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and fill in your values
cp .env.example .env
nano .env

# 3. Run the database migration (imports existing _data/*.json into SQLite)
npm run migrate

# 4. Start the server
npm start
```

The site will be available at `http://localhost:3000`  
Admin panel: `http://localhost:3000/admin`

---

## Production (with PM2)

PM2 keeps the server running and restarts it automatically on crash or reboot.

```bash
# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start ecosystem.config.js

# Make it start on system boot
pm2 startup
pm2 save

# Useful commands
pm2 logs adelaide-pavilion    # view logs
pm2 restart adelaide-pavilion # restart after code changes
pm2 stop adelaide-pavilion    # stop the server
```

---

## Nginx reverse proxy (recommended)

Run Nginx in front of Node so you get SSL termination and port 80/443.

```nginx
server {
    listen 80;
    server_name adelaidepavilion.com.au www.adelaidepavilion.com.au;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name adelaidepavilion.com.au www.adelaidepavilion.com.au;

    ssl_certificate     /etc/letsencrypt/live/adelaidepavilion.com.au/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/adelaidepavilion.com.au/privkey.pem;

    client_max_body_size 12M;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Get a free SSL certificate: `sudo certbot --nginx -d adelaidepavilion.com.au`

---

## Environment variables

| Variable              | Required | Description |
|-----------------------|----------|-------------|
| `ADMIN_USERNAME`      | Yes      | Admin panel login username |
| `ADMIN_PASSWORD`      | Yes      | Admin panel login password |
| `ALLOWED_ORIGIN`      | Yes      | Your live domain, e.g. `https://adelaidepavilion.com.au` |
| `MAILERSEND_API_KEY`  | Yes      | MailerSend API key for contact form emails |
| `TURNSTILE_SECRET_KEY`| No       | Cloudflare Turnstile secret (bot protection on forms) |
| `PORT`                | No       | Port to listen on (default: 3000) |

---

## Backups

Two things need backing up regularly:

1. **Database** — `db/cms.db` contains all CMS content
2. **Images** — `images/gallery/` and `images/managed/` contain uploaded photos

A simple daily backup script:
```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
tar -czf /backups/adelaide-pavilion-$DATE.tar.gz db/cms.db images/gallery images/managed
```

---

## Deploying updates

```bash
git pull
npm install   # only needed if package.json changed
pm2 restart adelaide-pavilion
```
