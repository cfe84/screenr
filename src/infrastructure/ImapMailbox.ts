import { IMailbox } from "../contracts/IMailbox";

import { default as ImapClient } from "emailjs-imap-client"
import { IMail } from "../contracts/IMail";
import { ImapTools } from "./ImapTools";
import { Console } from "console";

export interface ImapMailboxProps {
  host: string,
  port: number,
  user: string,
  password: string
}

const createClient = (props: ImapMailboxProps) => new ImapClient(props.host, props.port, {
  auth: {
    user: props.user,
    pass: props.password
  },
  requireTLS: true
})

export class ImapMailbox implements IMailbox {
  static ConnectAsync(props: ImapMailboxProps): Promise<ImapMailbox> {
    var client = createClient(props)

    return new Promise((resolve, reject) => {
      client.onerror = (error: any) => console.error(error)
      resolve(new ImapMailbox(client, props))
    })
  }

  private constructor(private client: any, private props: ImapMailboxProps) { }

  connectAsync(): Promise<void> {
    this.client = createClient(this.props)
    return this.client.connect()
      .then(console.log("Opened connection"))

  }
  disconnectAsync(): Promise<void> {
    return this.client.close()
      .then(console.log("Closed connection"))
  }

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