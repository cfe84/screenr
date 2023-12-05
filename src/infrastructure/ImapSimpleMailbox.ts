import { IMailbox } from "../contracts/IMailbox";
import * as imaps from "imap-simple"
import { IMail } from "../contracts/IMail";
import { ImapTools } from "./ImapTools";
import { IMailContent } from "../contracts/IMailContent";

export interface ImapSimpleMailboxProps {
  host: string,
  port: number,
  user: string,
  password: string
  validateCertificate?: boolean
}


const createConnectionAsync = (props: ImapSimpleMailboxProps) =>
  imaps.connect({
    imap: {
      user: props.user,
      password: props.password,
      host: props.host,
      port: props.port,
      tls: true,
      authTimeout: 10000
    }
  })

export class ImapSimpleMailbox implements IMailbox {
  private firstConnection = true;
  private client: any;
  constructor(private props: ImapSimpleMailboxProps) {
    if (props.validateCertificate !== undefined && !props.validateCertificate) {
      process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
    }
  }

  async connectAsync(): Promise<void> {
    await createConnectionAsync(this.props).then((connection: any) => {
      this.client = connection
    })
    console.log("Opened connection to " + this.props.host)
    if (this.firstConnection) {
      const boxes = await this.client.getBoxes()
      console.log(`Available boxes:`)
      console.log(boxes)
      this.firstConnection = false
    }
  }
  disconnectAsync(): Promise<void> {
    this.client.end()
    return Promise.resolve()
  }

  moveMailAsync = async (mailId: string, fromFolder: string, toFolder: string): Promise<void> => {
    console.log(`Moving mail ${mailId} from ${fromFolder} to ${toFolder}`)
    try {
      await this.client.openBox(fromFolder)
      await this.client.moveMessage(mailId, toFolder)
    } catch (error) {
      console.error(`Error when moving mail ${mailId}: ${error}. Trying to reconnect`)
      await this.disconnectAsync()
      await this.connectAsync()
    }
  }

  getMailAsync = async (inFolder: string): Promise<IMail[]> => {
    console.log(`Getting mails in ${inFolder}`)
    await this.client.openBox(inFolder)
    const res: any = await this.client.search(['ALL'], { bodies: ['HEADER.FIELDS (FROM SENDER)'] })
    return res.map((r: any) => {
      const sender = r.parts[0].body.sender ? r.parts[0].body.sender[0] : r.parts[0].body.from[0]
      return {
        mailId: r.attributes.uid,
        sender: ImapTools.parseFrom(sender)
      }
    })
  }

  async getMailContentAsync(inFolder: string, mailIds: string[]): Promise<IMailContent[]> {
    await this.client.openBox(inFolder);
    const mails = mailIds.join(",");
    const res: any = await this.client.search(["ALL"], { bodies: ["HEADER", ''] });
    let contents = [];
    for(let r of res) {
      const text = r.parts.filter((part: any) => part.which === "")[0].body;
      const header = r.parts.filter((part: any) => part.which === "HEADER")[0].body;
      const content = await ImapTools.getMailContent(text);
      contents.push({
        mailId: r.attributes.uid,
        subject: content.subject || header.subject[0],
        content: content.content || "",
      });
    };
    return contents;
  }
}