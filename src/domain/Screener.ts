import { IMail } from "../contracts/IMail";
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { IFolders, IFolderProvider, Folder } from "../contracts/IFolderProvider";
import { IMailbox } from "../contracts/IMailbox";
import { ScreeningResult } from "../contracts/ScreeningResult";
import { IDictionary } from "../contracts/IDictionary";

export interface IScreenerDeps {
  folders: IFolders
  senderScreeningProvider: ISenderScreeningResultProvider
  mailbox: IMailbox
}

export class Screener {
  constructor(private deps: IScreenerDeps) {

  }

  private screenInboxAsync = async (): Promise<void> => {
    const mails = await this.deps.mailbox.getMailAsync(this.deps.folders.Inbox)
    await Promise.all(mails.map(async mail => {
      const screeningResult = await this.deps.senderScreeningProvider.getScreeningResultAsync(mail.sender)
      switch (screeningResult) {
        case ScreeningResult.RequiresManualScreening:
          await this.deps.mailbox.moveMailAsync(mail.mailId, this.deps.folders.Inbox, this.deps.folders.ForScreening)
          break
        case ScreeningResult.Reference:
          await this.deps.mailbox.moveMailAsync(mail.mailId, this.deps.folders.Inbox, this.deps.folders.Reference)
          break
        case ScreeningResult.Newsletter:
          await this.deps.mailbox.moveMailAsync(mail.mailId, this.deps.folders.Inbox, this.deps.folders.Newsletter)
          break
        case ScreeningResult.Rejected:
          await this.deps.mailbox.moveMailAsync(mail.mailId, this.deps.folders.Inbox, this.deps.folders.Rejected)
          break
        default:
      }
    }))
  }

  ScreenMailAsync = async (): Promise<void> => {
    await this.screenInboxAsync()
  }
}