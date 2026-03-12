module.exports = {
  apps: [
    {
      name: 'crm-server',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      min_uptime: '10s',
      max_restarts: 30,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true
    }
  ]
};
