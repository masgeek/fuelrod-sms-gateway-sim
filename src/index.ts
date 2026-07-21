import {config} from './config/env'
import app from './app'
import {logger} from './utils/logger'
import fs from 'fs'
import path from 'path'

const version = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
).version;

const server = app.listen(config.port, () => {
    logger.info(`Running at http://127.0.0.1:${config.port}/api/v1 [${config.env}] v${version}`);
});

function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down`);
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

