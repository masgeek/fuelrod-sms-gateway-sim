module.exports = {
    apps: [
        {
            name: "fuelrod-sms-gateway",
            script: "dist/index.js",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "200M",
            env: {
                NODE_ENV: "production"
            }
        }],

    deploy: {
        production: {
            user: 'SSH_USERNAME',
            host: 'SSH_HOSTMACHINE',
            ref: 'origin/main',
            repo: 'GIT_REPOSITORY',
            path: 'DESTINATION_PATH',
            'pre-deploy-local': '',
            'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
            'pre-setup': ''
        }
    }
};

