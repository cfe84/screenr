export interface ILogger {
  debug(...messages: any[]): void;
  log(...messages: any[]): void;
  warn(...messages: any[]): void;
  error(...messages: any[]): void;
}