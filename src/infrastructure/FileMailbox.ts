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

type Cache = Record<string, string>;

const cacheFile = "screenr_cache.json";

export class FileMailbox implements IMailbox {
  constructor(private props: FileMailboxProps) {
    if (!fs.existsSync(props.rootFolder)) {
      throw new Error(`Root folder ${props.rootFolder} does not exist`)
    }
  }

  async getMailAsync(inFolder: string, fromMailId?: string | undefined): Promise<IMail[]> {
    const fromMailIdNumber = fromMailId ? this.getMailNumericalId(fromMailId) : undefined;
    const folder = this.getFolder(inFolder)
    const cache = this.getCache(inFolder);
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
      const mail: IMail = { mailId: file, sender: "" };
      const cached = cache[mailId.toString()];
      if (cached) {
        mail.sender = cached;
      } else {
        const location = path.join(folder, file);
        const content = fs.readFileSync(location);
        const parsedMail = await simpleParser(content);
        mail.sender = parsedMail.from?.value[0].address || "";
        cache[mailId] = mail.sender;
      }
      mails.push(mail)
    }
    this.pruneCache(cache, files.map(file => this.getMailNumericalId(file)));
    this.saveCache(cache, inFolder);
    return mails;
  }

  private pruneCache(cache: Cache, emailIds: number[]): void {
    for (let key in cache) {
      const emailId = Number.parseInt(key);
      if (!emailIds.includes(emailId)) {
        delete cache[key];
      }
    }
  }

  private saveCache(cache: Cache, inFolder: string): void {
    const cacheFilePath = this.getCacheFilePath(inFolder);
    const content = JSON.stringify(cache);
    fs.writeFileSync(cacheFilePath, content);
  }

  private getCache(inFolder: string): Cache {
    const cacheFilePath = this.getCacheFilePath(inFolder);
    if (!fs.existsSync(cacheFilePath)) {
      return {};
    }
    const content = fs.readFileSync(cacheFilePath);
    const cache = JSON.parse(content.toString());
    return cache;
  }

  private getCacheFilePath(folder: string) {
    folder = this.removeInboxFromFolder(folder);
    return path.join(this.props.rootFolder, folder, cacheFile);
  }

  private getFolder(folder: string): string {
    folder = this.removeInboxFromFolder(folder);
    return path.join(this.props.rootFolder, folder, "cur");
  }

  private removeInboxFromFolder(folder: string): string {
    if (folder.toLowerCase().startsWith("inbox")) {
      folder = folder.substring("inbox".length);
    }
    return folder;
  }

  private getMailNumericalId(mailId: string): number {
    const regex = /^(\d+)\./;
      const match = regex.exec(mailId);
      if (match === null) {
        return -1;
      }
      return Number.parseInt(match[1]);
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