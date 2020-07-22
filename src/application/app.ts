import { ImapMailbox, ImapMailboxProps } from "../infrastructure/ImapMailbox";
import { ImapSimpleMailbox } from "../infrastructure/ImapSimpleMailbox";
import * as fs from "fs"
import * as path from "path"
import { Screener } from "../domain/Screener";
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { IDictionary } from "../contracts/IDictionary";
import { ScreeningResult } from "../contracts/ScreeningResult";
import { FileSenderScreeningResultProvider } from "../infrastructure/FileSenderScreeningResultProvider";
import { IFolders } from "../contracts/IFolders";
import { IFolderConfiguration } from "../contracts/IFolderConfiguration";
import { Folder } from "../contracts/Folder";

class MemorySenderScreeningProvider implements ISenderScreeningResultProvider {
  memory: IDictionary<ScreeningResult> = {}
  getScreeningResultAsync = async (sender: string): Promise<ScreeningResult> => {
    return this.memory[sender]
  }
  addScreeningGuidelineAsync = async (sender: string, guideline: ScreeningResult): Promise<void> => {
    this.memory[sender] = guideline
  }
}

interface AppConfigFolders {
  [folderAlias: string]: string | IFolderConfiguration
}

type EmailClientType = "imapSimple" | "imap"

interface AppConfig {
  imap: ImapMailboxProps,
  folders: AppConfigFolders,
  storageFolder: string,
  pollFrequencySeconds: number,
  client?: EmailClientType
}

export class App {
  private config: AppConfig
  constructor(configFile: string) {
    const configContent = fs.readFileSync(configFile).toString()
    this.config = JSON.parse(configContent)
  }

  mapFolderConfigToIFolders(configFolders: AppConfigFolders): IFolders {
    const aliases = Object.keys(configFolders)
    const folders: IDictionary<IFolderConfiguration> = {}
    aliases.forEach(alias => {
      if (typeof configFolders[alias] === "string") {
        folders[alias] = {
          folder: configFolders[alias] as Folder,
          screeningFolder: configFolders[alias] as Folder
        }
      } else {
        folders[alias] = configFolders[alias] as IFolderConfiguration
      }
    })
    return {
      aliases,
      folders
    }
  }

  private createMailboxAsync = async () => {
    switch (this.config.client) {
      case "imapSimple":
        return new ImapSimpleMailbox(this.config.imap)
      case "imap":
      case undefined:
      default:
        return await ImapMailbox.ConnectAsync(this.config.imap)
    }
  }

  async runAsync() {
    const mailbox = await this.createMailboxAsync()
    const folders: IFolders = this.mapFolderConfigToIFolders(this.config.folders)
    const senderScreeningProvider = new FileSenderScreeningResultProvider(path.join(this.config.storageFolder, "senders.json"))
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
      setTimeout(screenAsync, (this.config.pollFrequencySeconds * 1000) || 20000)
    }
    await screenAsync()
  }
}

const configFile = process.env["SCREENR_CONFIG_FILE"] || "config.json"
new App(configFile).runAsync()
  .then(() => { })
  .catch((err) => console.error(err))