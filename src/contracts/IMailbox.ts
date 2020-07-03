import { MailId, IMail } from "./IMail";
import { Folder } from "./IFolderProvider";

export interface IMailbox {
    moveMailAsync(mailId: MailId, fromFolder: Folder, toFolder: Folder): Promise<void>
    getMailAsync(inFolder: Folder): Promise<IMail[]>
    connectAsync(): Promise<void>
    disconnectAsync(): Promise<void>
}