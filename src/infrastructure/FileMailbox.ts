import * as fs from "fs";
import * as path from "path";
import { simpleParser } from "mailparser";

import { IMail } from "../contracts/IMail";
import { IMailContent } from "../contracts/IMailContent";
import { IMailbox } from "../contracts/IMailbox";
import { ImapTools } from "./ImapTools";

export interface FileMailboxProps {
  rootFolder: string,
}

export class FileMailbox implements IMailbox {
  constructor(private props: FileMailboxProps) {
    if (!fs.existsSync(props.rootFolder)) {
      throw new Error(`Root folder ${props.rootFolder} does not exist`)
    }
  }

  private getFolder(folder: string): string {
    if (folder.toLowerCase() === "inbox") {
      folder = ""
    }
    return path.join(this.props.rootFolder, folder, "cur");
  }

  private getMailNumericalId(mailId: string): number {
    const regex = /^(\d+)\./;
      const match = regex.exec(mailId);
      if (match === null) {
        return -1;
      }
      return Number.parseInt(match[1]);
  }

  async getMailAsync(inFolder: string, fromMailId?: string | undefined): Promise<IMail[]> {
    const fromMailIdNumber = fromMailId ? this.getMailNumericalId(fromMailId) : undefined;
    const folder = this.getFolder(inFolder)
    const files = fs.readdirSync(folder)
    const mails: IMail[] = []
    for (let file of files) {
      const mailId = this.getMailNumericalId(file);
      if (mailId === -1) {
        continue;
      }
      if (fromMailIdNumber !== undefined && mailId < fromMailIdNumber) {
        continue;
      }
      const location = path.join(folder, file);
      const parsedMail = await simpleParser(location);
      const mail: IMail = {
        mailId: file,
        sender: parsedMail.from?.value[0].address || ""
      }
      mails.push(mail)
    }
    return mails;
  }

  async moveMailAsync(mailId: string, fromFolder: string, toFolder: string): Promise<void> {
    const fromFolderFullPath = this.getFolder(fromFolder);
    const fromFileName = path.join(fromFolderFullPath, mailId);
    const toFolderFullPath = this.getFolder(toFolder);
    const toFileName = path.join(toFolderFullPath, mailId);
    if (!fs.existsSync(fromFileName)) {
      throw new Error(`Cannot find file ${fromFileName}`)
    }
    if (fs.existsSync(toFileName)) {
      throw new Error(`File ${toFileName} already exists`)
    }
    fs.renameSync(fromFileName, toFileName);
  }

  async getMailContentAsync(inFolder: string, mailIds: string[]): Promise<IMailContent[]> {
    const folder = this.getFolder(inFolder);
    const mailContents: IMailContent[] = [];
    for (let mailId of mailIds) {
      const mailFileName = path.join(folder, mailId);
      if (!fs.existsSync(mailFileName)) {
        throw new Error(`Cannot find file ${mailFileName}`)
      }
      const content = fs.readFileSync(mailFileName);
      const parsedMail = await ImapTools.getMailContent(content.toString());
      const mailContent: IMailContent = {
        mailId: `${mailId}`,
        subject:  parsedMail.subject || "",
        content: parsedMail.content || ""
      }
      mailContents.push(mailContent);
    }
    return mailContents;
  }
  connectAsync(): Promise<void> {
    return Promise.resolve();
  }

  disconnectAsync(): Promise<void> {
    return Promise.resolve();
  }

}