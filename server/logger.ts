import winston from 'winston';
import { config } from './config.js';

export const logger = winston.createLogger({
  level: config.log.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    config.nodeEnv === 'development'
      ? winston.format.combine(winston.format.colorize(), winston.format.simple())
      : winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});
