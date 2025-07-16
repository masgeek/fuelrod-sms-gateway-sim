import {createLogger, format, transports} from 'winston';

export const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({timestamp, level, message, ...meta}) => {
            const metaStr = Object.keys(meta).length
                ? JSON.stringify(meta, null, 2)
                : '';
            return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr ? ` ${metaStr}` : ''}`;
        })
    ),
    transports: [
        new transports.Console(),
        new transports.File({filename: 'logs/error.log', level: 'error'}),
        new transports.File({filename: 'logs/combined.log'})
    ]
});


