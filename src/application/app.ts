import { ImapMailbox, ImapMailboxProps } from "../infrastructure/ImapMailbox";
import * as fs from "fs"
import { Screener } from "../domain/Screener";
import { IFolders } from "../contracts/IFolderProvider";
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { IDictionary } from "../contracts/IDictionary";
import { ScreeningResult } from "../contracts/ScreeningResult";

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
  folders: IFolders
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
    const screener = new Screener({
      mailbox,
      folders,
      senderScreeningProvider: new MemorySenderScreeningProvider(),
      log: console
    })

    const screenAsync = async () => {
      try {
        await screener.ScreenMailAsync()
      } catch (error) {
        console.error(error)
      }
      setTimeout(screenAsync, 20000)
    }
    await screenAsync()
  }
}

new App("config.json").runAsync()
  .then(() => { })
  .catch((err) => console.error(err))