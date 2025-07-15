import {createLogger, format, transports} from 'winston';

export const logger = createLogger({
    level: process.env.LOG_LEVEL || 'debug',
    format: format.combine(
        format.timestamp(),
        format.printf(
            ({level, message, timestamp}) => `[${timestamp}] ${level.toUpperCase()}: ${message}`
        )
    ),
    transports: [
        new transports.Console(),
        new transports.File({filename: 'logs/error.log', level: 'error'}),
        new transports.File({filename: 'logs/combined.log'})
    ]
});
