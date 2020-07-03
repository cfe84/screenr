import { IMailbox } from "../contracts/IMailbox";

import { default as ImapClient, ImapClientLogLevel } from "emailjs-imap-client"
import { IMail } from "../contracts/IMail";
import { ImapTools } from "./ImapTools";

export interface ImapMailboxProps {
  host: string,
  port: number,
  user: string,
  password: string
}

const createClient = (props: ImapMailboxProps) => new ImapClient(props.host, props.port, {
  logLevel: 40,
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
      .then(() => console.log("Opened connection"))

  }
  disconnectAsync(): Promise<void> {
    return this.client.close()
      .then(() => console.log("Closed connection"))
  }

  moveMailAsync = async (mailId: string, fromFolder: string, toFolder: string): Promise<void> => {
    this.client.onerror = (error: any) => {
    }
    try {
      await this.client.moveMessages(fromFolder, mailId, toFolder, { byUid: true })
    } catch (error) {
      if (error.message.indexOf("Socket closed unexpectedly!") >= 0 || error.message.indexOf("Socket timed out!") >= 0) {
        console.error("Socket disconnected, reconnecting")
        await this.disconnectAsync()
        await this.connectAsync()
      }
      throw error
    }
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