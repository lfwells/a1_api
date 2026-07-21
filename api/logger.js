/** From Gemini */

import winston from 'winston';
import 'winston-daily-rotate-file';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDirectory = join(__dirname, 'logs');

const dailyRotateTransport = new winston.transports.DailyRotateFile({
  dirname: logDirectory,
  // %DATE% is dynamically replaced using the datePattern setting
  filename: 'application-%DATE%.log', 
  datePattern: 'YYYY-MM-DD', // Rotates precisely at midnight every day
  zippedArchive: true,       // Gzips historical log files to save disk space
  maxSize: '20m',            // Additional safety cap: rolls over early if file hits 20MB
  maxFiles: '28d'            // Automated cleanup: deletes logs older than 28 days (deliberately long so I can gather them from the server at my leisure)
});

// Define custom log formats
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.simple()
);

// Create the Winston Logger
export const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    // 1. Write all logs info-level and below to the daily log file
    dailyRotateTransport,
    // 2. Also output to the console for real-time visibility during development
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

// Create a stream object that Morgan can hook into
export const morganStream = {
  write: (message) => logger.info(message.trim())
};