import pino from 'pino';

export const createLogger = ({ name, level = 'info' }) => pino({ name, level });
export const silentLogger = pino({ level: 'silent' });
