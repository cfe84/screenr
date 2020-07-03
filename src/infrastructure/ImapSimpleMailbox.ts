import { IMailbox } from "../contracts/IMailbox";
import * as imaps from "imap-simple"
import { IMail } from "../contracts/IMail";
import { ImapTools } from "./ImapTools";

export interface ImapMailboxProps {
  host: string,
  port: number,
  user: string,
  password: string
}


const createConnectionAsync = (props: ImapMailboxProps) =>
  imaps.connect({
    imap: {
      user: props.user,
      password: props.password,
      host: props.host,
      port: props.port,
      tls: true,
      authTimeout: 3000
    }
  })

export class ImapSimpleMailbox implements IMailbox {

  private client: any;
  constructor(private props: ImapMailboxProps) { }

  connectAsync(): Promise<void> {
    return createConnectionAsync(this.props).then((connection: any) => {
      this.client = connection
    })
      .then(console.log("Opened connection to " + this.props.host))

  }
  disconnectAsync(): Promise<void> {
    this.client.end()
    return Promise.resolve()
  }

  moveMailAsync(mailId: string, fromFolder: string, toFolder: string): Promise<void> {
    console.log(`Moving mail ${mailId} from ${fromFolder} to ${toFolder}`)
    return this.client.openBox(fromFolder)
      .then(() => this.client.moveMessage(mailId, toFolder))
      .catch((error: any) => console.error(error))
  }

  getMailAsync = (inFolder: string): Promise<IMail[]> => {
    console.log(`Getting mails in ${inFolder}`)
    return this.client.openBox(inFolder)
      .then(() => this.client.search(['ALL'], { bodies: ['HEADER.FIELDS (FROM)'] }))
      .then((res: any) => {
        return res.map((r: any) => {
          return {
            mailId: r.attributes.uid,
            sender: ImapTools.parseFrom(r.parts[0].body.from[0])
          }
        })
      })
  }
}