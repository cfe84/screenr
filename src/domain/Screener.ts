import { IMail, Sender } from "../contracts/IMail";
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { IMailbox } from "../contracts/IMailbox";
import { ScreeningResult, ScreeningResultType } from "../contracts/ScreeningResult";
import { IDictionary } from "../contracts/IDictionary";
import { ILogger } from "../contracts/ILogger";
import { FOR_SCREENING_FOLDER_ALIAS, Folder, FolderAlias, INBOX_FOLDER_ALIAS } from "../contracts/Folder";
import { IFolders } from "../contracts/IFolders";

export interface IScreenerDeps {
  folders: IFolders
  senderScreeningProvider: ISenderScreeningResultProvider
  mailbox: IMailbox
  log: ILogger
}

interface ScreeningGuidelineChange {
  sender: Sender,
  newGuideline: ScreeningResult
}

export class Screener {
  constructor(private deps: IScreenerDeps) {

  }

  private screenFolder = async (mails: IMail[], correspondingScreeningResult: ScreeningResult): Promise<ScreeningGuidelineChange[]> => {
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

  private getFolderForScreeningResult = (screeningResult: ScreeningResult): Folder => {
    if (screeningResult.result === ScreeningResultType.RequiresManualScreening) {
      return this.deps.folders.folders[FOR_SCREENING_FOLDER_ALIAS].folder
    } else {
      return this.deps.folders.folders[screeningResult.targetFolderAlias as string].folder
    }
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

  private moveMailsInFolderAsync = async (folder: Folder, mails: IMail[]): Promise<void> => {
    for (let i = 0; i < mails.length; i++) {
      const mail = mails[i]
      const screeningResult = await this.deps.senderScreeningProvider.getScreeningResultAsync(mail.sender)
      const targetFolder = this.getFolderForScreeningResult(screeningResult)
      if (folder !== targetFolder) {
        try {
          await this.deps.mailbox.moveMailAsync(mail.mailId, folder, targetFolder)
        }
        catch (error) {
          this.deps.log.error(`Couldn't move ${mail.mailId} sent by ${mail.sender} from ${folder} to ${targetFolder}: ${error}.`)
        }
      }
    }
  }

  private async determineChanges(mails: IDictionary<IMail[]>) {
    let changes = [] as ScreeningGuidelineChange[];

    for (let i = 0; i < this.deps.folders.aliases.length; i++) {
      const alias = this.deps.folders.aliases[i];
      // We don't learn what goes into "for screening": it's a default behavior
      // for senders that are not yet known.
      if (alias !== FOR_SCREENING_FOLDER_ALIAS) {
        const screeningFolder = this.deps.folders.folders[alias].screeningFolder
        changes = changes.concat(await this.screenFolder(mails[screeningFolder],
          { result: ScreeningResultType.TargetFolder, targetFolderAlias: alias }));
      }
    }

    await this.applyGuidelineChanges(changes);
  }

  private applyGuidelineChanges = async (changes: ScreeningGuidelineChange[]) => {
    await Promise.all(changes.map(async change =>
      await this.deps.senderScreeningProvider.addScreeningGuidelineAsync(change.sender, change.newGuideline)
    ))
  }

  ScreenMailAsync = async (): Promise<void> => {
    await this.deps.mailbox.connectAsync()

    try {
      const mails: IDictionary<IMail[]> = await this.fetchAllMailsAsync();
      await this.determineChanges(mails);
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
      const folder = this.deps.folders.folders[alias];
      mails[folder.folder] = await this.deps.mailbox.getMailAsync(folder.folder);
      if (folder.screeningFolder !== folder.folder) {
        mails[folder.screeningFolder] = await this.deps.mailbox.getMailAsync(folder.screeningFolder);
      }
    }
    return mails;
  }
}