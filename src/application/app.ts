import { ImapMailbox, ImapMailboxProps } from "../infrastructure/ImapMailbox";
import { ImapSimpleMailbox, ImapSimpleMailboxProps } from "../infrastructure/ImapSimpleMailbox";
import * as fs from "fs"
import * as path from "path"
import * as http from "http";
import { Screener } from "../domain/Screener";
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { IDictionary } from "../contracts/IDictionary";
import { ScreeningResult } from "../contracts/ScreeningResult";
import { FileSenderScreeningResultProvider } from "../infrastructure/FileSenderScreeningResultProvider";
import { IFolders } from "../contracts/IFolders";
import { IFolderConfiguration } from "../contracts/IFolderConfiguration";
import { Folder } from "../contracts/Folder";
import { SpamDetector, SpamDetectorDeps } from "../domain/SpamDetector";
import { FileMailbox, FileMailboxProps } from "../infrastructure/FileMailbox";
import { FileSpamTrainingStore } from "../infrastructure/FileSpamTrainingStore";

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

interface SpamConfig {
  "isSpam": string,
  "isHam": string,
  "recycleBox": string,
  "trainingFrequencyHours": number,
  "trainingDatasetSizeLimit": number,
}

interface AppConfig {
  imap?: ImapMailboxProps,
  imapSimple?: ImapSimpleMailboxProps,
  fileMailbox?: FileMailboxProps,
  folders: AppConfigFolders,
  storageFolder: string,
  pollFrequencySeconds: number,
  spam?: SpamConfig,
}

export class App {
  private config: AppConfig
  private lastChecks: Date[] = [];

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

  private async startHttpServerAsync() {
    const server = http.createServer((req, res) => {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end(`Checks every ${this.config.pollFrequencySeconds} seconds. Last checks:\n${this.lastChecks.join("\n")}`);
    });
    server.listen(() => console.log(`Server started on port ${JSON.stringify(server.address()!)}`));
  }

  private createMailboxAsync = async () => {
    if (this.config.imapSimple) {
      return new ImapSimpleMailbox(this.config.imapSimple)
    }
    else if (this.config.imap) {
      return await ImapMailbox.ConnectAsync(this.config.imap)
    }
    else if (this.config.fileMailbox) {
      return new FileMailbox(this.config.fileMailbox)
    }
    else {
      throw Error(`Invalid configuration - no client configured`)
    }
  }

  async runAsync() {
    const mailbox = await this.createMailboxAsync()
    const folders: IFolders = this.mapFolderConfigToIFolders(this.config.folders)
    const senderScreeningProvider = new FileSenderScreeningResultProvider(path.join(this.config.storageFolder, "senders.json"))
    const log = console
    let spamDetector: SpamDetector | undefined = undefined

    if (this.config.spam)
    {
      const spamTrainingStore = new FileSpamTrainingStore(path.join(this.config.storageFolder, "spam.json"))
      const deps: SpamDetectorDeps = {
        mailbox,
        log,
        spamTrainingProvider: spamTrainingStore
      }
      spamDetector = await SpamDetector.CreateAsync(deps, this.config.spam.isHam, this.config.spam.isSpam, this.config.spam.trainingDatasetSizeLimit || undefined);
    }

    const screener = new Screener({
      mailbox,
      folders,
      senderScreeningProvider,
      log,
      spamDetector
    });

    const screenAsync = async () => {
      try {
        log.log(`Started screening`)
        await screener.ScreenMailAsync()
        this.lastChecks.push(new Date());
        while(this.lastChecks.length > 5) {
            this.lastChecks.shift();
        }
        log.log(`Screening complete`)
      } catch (error) {
        log.error(`Screening failed: ${error}`)
      }
      setTimeout(screenAsync, (this.config.pollFrequencySeconds * 1000) || 20000)
    }
    await screenAsync();
    if (spamDetector) {
      const trainSpamAsync = async () => {
        try {
          log.log(`Started training spam`)
          await spamDetector?.TrainAsync();
          log.log(`Training spam complete`)
        } catch(error) {
          log.error(`Training spam failed: ${error}`)
        }
        setTimeout(() => trainSpamAsync().then(), (this.config.spam!.trainingFrequencyHours * 60 * 60 * 1000) || 24 * 60 * 60 * 1000);
      }
      setTimeout(() => trainSpamAsync().then(), 10);
    }
    await this.startHttpServerAsync();
  }
}

const configFile = process.env["SCREENR_CONFIG_FILE"] || "config.json"
new App(configFile).runAsync()
  .then(() => { })
  .catch((err) => console.error(err))