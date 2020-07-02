import { IMailbox } from "../contracts/IMailbox";

import { default as ImapClient } from "emailjs-imap-client"
import { IMail } from "../contracts/IMail";
import { ImapTools } from "./ImapTools";

export interface ImapMailboxProps {
  host: string,
  port: number,
  user: string,
  password: string
}

export class ImapMailbox implements IMailbox {
  static ConnectAsync(props: ImapMailboxProps): Promise<ImapMailbox> {
    var client = new ImapClient(props.host, props.port, {
      auth: {
        user: props.user,
        pass: props.password
      },
      requireTLS: true
    })

    return new Promise((resolve, reject) => {
      client.onerror = (error: any) => console.error(error)
      client.connect().then(() => {
        resolve(new ImapMailbox(client))
      })
    })
  }

  private constructor(private client: any) { }

  moveMailAsync(mailId: string, fromFolder: string, toFolder: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.onerror = (error: any) => reject(error)
      this.client.moveMessages(fromFolder, mailId, toFolder, { byUid: true })
        .then(() => { resolve() })
        .catch((error: any) => console.error(error))
    })
  }

  getMailAsync = (inFolder: string): Promise<IMail[]> => {
    return new Promise((resolve, reject) => {
      this.client.onerror = (error: any) => reject(error)
      this.client.listMessages(inFolder, "1:*", ["uid", 'BODY.PEEK[Header.fields (FROM)]'], { byUid: true }).then((mails: any) => {
        resolve(mails.map(ImapTools.mapResponseToMail))
      })
        .catch((err: any) => {
          console.error(err)
        })
    })
  }
}