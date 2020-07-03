import { IMail, Sender } from "../contracts/IMail";

export class ImapTools {
  static parseFrom(from: string): Sender {
    const regex1 = /<([^>]+)/
    const regex2 = /From: ([^\r]+)(?:\r|^)/
    if (!from) {
      return from
    }
    let address = from.match(regex1)
    if (address) {
      return address[1]
    }
    address = from.match(regex2)
    if (address) {
      return address[1]
    }
    return from
  }
  static mapResponseToMail(response: any): IMail {
    const mail = {
      mailId: `${response.uid}`,
      sender: ImapTools.parseFrom(response["body[header.fields (from)]"])
    } as IMail
    if (!mail.sender) {
      console.error(`Error: Cannot parse sender in ${JSON.stringify(response)}`)
    }
    return mail;
  }
}