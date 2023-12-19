import { IMail, Sender } from "../contracts/IMail";
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { IMailbox } from "../contracts/IMailbox";
import { ScreeningResult, ScreeningResultType } from "../contracts/ScreeningResult";
import { IDictionary } from "../contracts/IDictionary";
import { ILogger } from "../contracts/ILogger";
import { FOR_SCREENING_FOLDER_ALIAS, Folder, FolderAlias, INBOX_FOLDER_ALIAS } from "../contracts/Folder";
import { IFolders } from "../contracts/IFolders";
import { SpamDetector } from "./SpamDetector";

export interface IScreenerDeps {
  folders: IFolders
  senderScreeningProvider: ISenderScreeningResultProvider
  mailbox: IMailbox
  log: ILogger
  spamDetector?: SpamDetector
}

interface ScreeningGuidelineChange {
  sender: Sender,
  newGuideline: ScreeningResult
}

export class Screener {
  constructor(private deps: IScreenerDeps, private spamFolder?: string) {}

  ScreenMailAsync = async (): Promise<void> => {
    await this.deps.mailbox.connectAsync()
    try {
      const mails: IDictionary<IMail[]> = await this.fetchAllMailsAsync();
      await this.determineGuidelineChanges(mails);
      await this.moveMails(mails);
    } catch (error) {
      this.deps.log.error(error)
    }
    await this.deps.mailbox.disconnectAsync()
  }

  private async fetchAllMailsAsync() {
    const mails: IDictionary<IMail[]> = {};
    for (let i = 0; i < this.deps.folders.aliases.length; i++) {
      const alias = this.deps.folders.aliases[i];
      this.deps.log.debug(`fetchAllMailsAsync: ${alias} - started`);
      const folder = this.deps.folders.folders[alias];
      mails[folder.folder] = await this.deps.mailbox.getMailAsync(folder.folder);
      this.deps.log.debug(`fetchAllMailsAsync: ${alias} - fetched ${mails[folder.folder].length} emails`);
      if (folder.screeningFolder !== folder.folder) {
        this.deps.log.debug(`fetchAllMailsAsync: ${alias} - fetching screening folder (${folder.screeningFolder})`);
        mails[folder.screeningFolder] = await this.deps.mailbox.getMailAsync(folder.screeningFolder);
        this.deps.log.debug(`fetchAllMailsAsync: ${alias} - fetched ${mails[folder.screeningFolder].length} in screening folder`);
      }
      this.deps.log.debug(`fetchAllMailsAsync: ${alias} - done`);
    }
    return mails;
  }


  /**
   * Determines if there are any changes to the screening guidelines
   * @param mails 
   */
  private async determineGuidelineChanges(mails: IDictionary<IMail[]>) {
    let changes = [] as ScreeningGuidelineChange[];

    for (let i = 0; i < this.deps.folders.aliases.length; i++) {
      const alias = this.deps.folders.aliases[i];
      this.deps.log.debug(`determineChanges: ${alias} - started`)
      // We don't learn what goes into "for screening": it's a default behavior
      // for senders that are not yet known.
      if (alias !== FOR_SCREENING_FOLDER_ALIAS) {
        const screeningFolder = this.deps.folders.folders[alias].screeningFolder
        changes = changes.concat(await this.screenFolder(mails[screeningFolder],
          { result: ScreeningResultType.TargetFolder, targetFolderAlias: alias }));
      }
      this.deps.log.debug(`determineChanges: ${alias} - done`)
    }

    await this.applyGuidelineChanges(changes);
  }

  private async screenFolder(mails: IMail[], correspondingScreeningResult: ScreeningResult): Promise<ScreeningGuidelineChange[]> {
    const changes: ScreeningGuidelineChange[] = []
    await Promise.all(mails.map(async mail => {
      const screeningResult = await this.deps.senderScreeningProvider.getScreeningResultAsync(mail.sender)
      if (screeningResult.result !== correspondingScreeningResult.result
        || screeningResult.targetFolderAlias !== correspondingScreeningResult.targetFolderAlias) {
        changes.push({
          sender: mail.sender,
          newGuideline: correspondingScreeningResult
        })
      }
    }))
    return changes
  }

  private async applyGuidelineChanges(changes: ScreeningGuidelineChange[]) {
    await Promise.all(changes.map(async change =>
      {
        this.deps.log.debug(`applyGuidelineChanges: Applying guideline change for ${change.sender}: ${change.newGuideline}`)
        await this.deps.senderScreeningProvider.addScreeningGuidelineAsync(change.sender, change.newGuideline)
      }
    ))
  }

  private async moveMails(mails: IDictionary<IMail[]>) {
    for (let i = 0; i < this.deps.folders.aliases.length; i++) {
      const alias = this.deps.folders.aliases[i];
      const folder = this.deps.folders.folders[alias].screeningFolder;
      await this.moveMailsInFolderAsync(folder, mails[folder]);
    }
    const inboxFolder = this.deps.folders.folders[INBOX_FOLDER_ALIAS].folder;
    await this.moveMailsInFolderAsync(inboxFolder, mails[inboxFolder]);
  }

  private async moveMailsInFolderAsync(folder: Folder, mails: IMail[]): Promise<void> {
    this.deps.log.debug(`moveMailsInFolderAsync: ${folder} - screening ${mails.length} mails`)
    for (let i = 0; i < mails.length; i++) {
      const mail = mails[i]
      const screeningResult = await this.deps.senderScreeningProvider.getScreeningResultAsync(mail.sender)
      const targetFolder = await this.getFolderForScreeningResult(screeningResult, folder, mail.mailId);
      if (folder !== targetFolder) {
        try {
          await this.deps.mailbox.moveMailAsync(mail.mailId, folder, targetFolder);
        }
        catch (error) {
          this.deps.log.error(`moveMailsInFolderAsync: Couldn't move ${mail.mailId} sent by ${mail.sender} from ${folder} to ${targetFolder}: ${error}.`)
        }
      }
    }
    this.deps.log.debug(`moveMailsInFolderAsync: ${folder} - done screening ${mails.length} mails`)
  }

  private async getFolderForScreeningResult(screeningResult: ScreeningResult, folder: string, mailId: string): Promise<Folder> {
    if (screeningResult.result === ScreeningResultType.RequiresManualScreening) {
      if (this.spamFolder && this.deps.spamDetector) {
        const content = await this.deps.mailbox.getMailContentAsync(folder, [mailId]);
        const isSpam = await this.deps.spamDetector.detectSpamAsync(content[0]);
        if (isSpam) {
          return this.spamFolder;
        }
      }
      return this.deps.folders.folders[FOR_SCREENING_FOLDER_ALIAS].folder
    } else {
      return this.deps.folders.folders[screeningResult.targetFolderAlias as string].folder
    }
  }
}