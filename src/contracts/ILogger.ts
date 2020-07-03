export interface ILogger {
  log(...messages: string[]): void;
  warn(...messages: string[]): void;
  error(...messages: string[]): void;
}