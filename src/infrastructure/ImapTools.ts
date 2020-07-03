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
    return {
      mailId: `${response.uid}`,
      sender: ImapTools.parseFrom(response["body[header.fields (from)]"])
    } as IMail
  }
}