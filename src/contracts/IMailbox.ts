import { MailId, IMail } from "./IMail";
import { Folder } from "./Folder";
import { IMailContent } from "./IMailContent";

export interface IMailbox {
    moveMailAsync(mailId: MailId, fromFolder: Folder, toFolder: Folder): Promise<void>
    getMailAsync(inFolder: Folder, fromMailId?: MailId): Promise<IMail[]>
    getMailContentAsync(inFolder: Folder, mailIds: MailId[]): Promise<IMailContent[]>
    connectAsync(): Promise<void>
    disconnectAsync(): Promise<void>
}