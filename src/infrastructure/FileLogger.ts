import * as fs from "fs"
import { ILogger } from "../contracts/ILogger";

export class FileLogger implements ILogger {
  constructor(private logFile: string) { }
  private logMsg(level: string, ...messages: string[]) {
    const message = `${level} - ${new Date()} - ${messages.join(" ")}\n`
    fs.appendFileSync(this.logFile, message);
  }
  debug(...messages: string[]): void {
    this.logMsg("DEBUG  ", ...messages)
  }
  log(...messages: string[]): void {
    this.logMsg("LOG    ", ...messages)
  }
  warn(...messages: string[]): void {
    this.logMsg("WARNING", ...messages)
  }
  error(...messages: string[]): void {
    this.logMsg("ERROR  ", ...messages)
  }

}