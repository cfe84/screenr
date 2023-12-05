import { IMailbox } from "../contracts/IMailbox";
import { default as ImapClient, ImapClientOptions } from "emailjs-imap-client"
import { IMail } from "../contracts/IMail";
import { ImapTools } from "./ImapTools";
import { IMailContent } from "../contracts/IMailContent";

export interface ImapMailboxProps {
  host: string,
  port: number,
  user: string,
  password: string,
  ca?: string,
  validateCertificate?: boolean,
  ssl?: boolean
}

const createClient = (props: ImapMailboxProps) => {
  const options: ImapClientOptions = {
    logLevel: 40,
    auth: {
      user: props.user,
      pass: props.password
    },
    requireTLS: true
  }
  if (!!props.ca) {
    options.ca = props.ca
  }
  if (!!props.ssl) {
    options.useSecureTransport = true
  }
  return new ImapClient(props.host, props.port, options)
}

export class ImapMailbox implements IMailbox {
  static ConnectAsync(props: ImapMailboxProps): Promise<ImapMailbox> {
    if (props.validateCertificate !== undefined && !props.validateCertificate) {
      process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
    }
    var client = createClient(props)

    return new Promise((resolve, reject) => {
      client.onerror = (error: any) => console.error(error)
      resolve(new ImapMailbox(client, props))
    })
  }

  private constructor(private client: ImapClient, private props: ImapMailboxProps) { }

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

  getMailAsync = (inFolder: string, fromMailId: string = "1"): Promise<IMail[]> => {
    return new Promise((resolve, reject) => {
      this.client.onerror = (error: any) => reject(error)
      this.client.listMessages(inFolder, `${fromMailId}:*`, ["uid", 'BODY.PEEK[Header.fields (FROM)]'], { byUid: true })
        .then((mails: any) => {
          resolve(mails.map(ImapTools.mapResponseToMail))
        })
        .catch((err: any) => {
          console.error(err)
        })
    })
  }

  private async mapResponseToMailContentAsync(response: any): Promise<IMailContent> {
    const mail = await ImapTools.getMailContent(response["body[]"]);
    return {
      mailId: `${response.uid}`,
      subject: mail.subject || response["subject"],
      content: mail.content || "",
    }
  }

  getMailContentAsync(inFolder: string, mailIds: string[]): Promise<IMailContent[]> {
    return new Promise((resolve, reject) => {
      this.client.onerror = (error: any) => reject(error)
      this.client.listMessages(inFolder, mailIds.join(","), ["UID", 'BODY.PEEK[Header.fields (SUBJECT)]', "BODY.PEEK[]"], { byUid: true })
      .then((mails: any[]) => mails.map(this.mapResponseToMailContentAsync))
      .then((mails: Promise<IMailContent>[]) => Promise.all(mails))
      .then((mails: IMailContent[]) => resolve(mails))
      .catch((err: any) => {
        console.error(err)
      })
    })
  }

}