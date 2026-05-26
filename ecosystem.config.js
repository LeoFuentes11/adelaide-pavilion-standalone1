/**
 * ecosystem.config.js — PM2 process manager config
 *
 * Install PM2:  npm install -g pm2
 * Start:        pm2 start ecosystem.config.js
 * Auto-restart: pm2 startup && pm2 save
 * Logs:         pm2 logs adelaide-pavilion
 */
module.exports = {
  apps: [{
    name:        'adelaide-pavilion',
    script:      'server.js',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT:     3000,
    },
    error_file: 'logs/error.log',
    out_file:   'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
