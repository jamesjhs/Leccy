/**
 * PM2 Ecosystem Configuration for Leccy
 *
 * Usage:
 *   pm2 start ecosystem.config.js          # start / restart
 *   pm2 reload ecosystem.config.js         # zero-downtime reload
 *   pm2 stop leccy
 *   pm2 save                               # persist process list
 *   pm2 startup                            # register on-boot service
 */

module.exports = {
  apps: [
    {
      name: 'leccy',

      // Path to the compiled entry point (run `npm run build` in server/ first)
      script: './server/dist/index.js',

      // Working directory — the repo root so relative paths in .env resolve correctly
      cwd: __dirname,

      // Load environment variables from the .env file at the repo root
      env_file: '.env',

      // Production environment overrides
      env_production: {
        NODE_ENV: 'production',
      },

      // Restart on crash; allow up to 10 restarts in 30 seconds before giving up
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',

      // Rotate logs — each file capped at 10 MB, keep 5 rotations
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: './logs/leccy-out.log',
      error_file: './logs/leccy-error.log',
      merge_logs: true,

      // Graceful shutdown — wait up to 5 s for in-flight requests
      kill_timeout: 5000,

      // Run as a single instance (not cluster mode — SQLite WAL handles concurrency)
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
