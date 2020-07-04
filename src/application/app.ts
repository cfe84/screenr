import { ImapMailbox, ImapMailboxProps } from "../infrastructure/ImapMailbox";
import * as fs from "fs"
import * as path from "path"
import { Screener } from "../domain/Screener";
import { IFolders } from "../contracts/IFolderProvider";
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { IDictionary } from "../contracts/IDictionary";
import { ScreeningResult } from "../contracts/ScreeningResult";
import { FileSenderScreeningResultProvider } from "../infrastructure/FileSenderScreeningResultProvider";
import { FileLogger } from "../infrastructure/FileLogger";

class MemorySenderScreeningProvider implements ISenderScreeningResultProvider {
  memory: IDictionary<ScreeningResult> = {}
  getScreeningResultAsync = async (sender: string): Promise<ScreeningResult> => {
    return this.memory[sender]
  }
  addScreeningGuidelineAsync = async (sender: string, guideline: ScreeningResult): Promise<void> => {
    this.memory[sender] = guideline
  }
}

interface AppConfig {
  imap: ImapMailboxProps,
  folders: IFolders,
  storageFolder: string
}

export class App {
  private config: AppConfig
  constructor(configFile: string) {
    const configContent = fs.readFileSync(configFile).toString()
    this.config = JSON.parse(configContent)
  }
  async runAsync() {
    const mailbox = await ImapMailbox.ConnectAsync(this.config.imap)
    const folders: IFolders = this.config.folders
    const senderScreeningProvider = new FileSenderScreeningResultProvider(path.join(this.config.storageFolder, "senders.json"))
    // const log = new FileLogger(path.join(this.config.storageFolder, "screenr.log"))
    const log = console
    const screener = new Screener({
      mailbox,
      folders,
      senderScreeningProvider,
      log
    })

    const screenAsync = async () => {
      try {
        log.log(`Started screening`)
        await screener.ScreenMailAsync()
        log.log(`Screening complete`)
      } catch (error) {
        log.error(`Screening failed: ${error}`)
      }
      setTimeout(screenAsync, 20000)
    }
    await screenAsync()
  }
}

const configFile = process.env["SCREENR_CONFIG_FILE"] || "config.json"
new App(configFile).runAsync()
  .then(() => { })
  .catch((err) => console.error(err))