import { IMail, Sender } from "../contracts/IMail";
import { IMailContent } from "../contracts/IMailContent";
import { simpleParser } from "mailparser";

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

  static async getMailContent(mimeMail: string): Promise<Partial<IMailContent>> {
    const parsed = mimeMail ? await simpleParser(mimeMail) : null;
    const content = parsed ? this.cleanupText(`${parsed.text}`) : "";
    const subject = parsed ? this.cleanupText(`${parsed.subject}`) : "";
    const uid = parsed?.messageId;
    return {
      subject,
      content,
      mailId: uid,
    }
  }

  private static decodeEntities(encodedString: string) {
    var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    var translate: Record<string, string> = {
        "nbsp":" ",
        "amp" : "&",
        "quot": "\"",
        "lt"  : "<",
        "gt"  : ">"
    };
    return encodedString.replace(translate_re, function(match, entity) {
        return translate[entity];
    }).replace(/&#(\d+);/gi, function(match, numStr) {
        var num = parseInt(numStr, 10);
        return String.fromCharCode(num);
    });
}


  private static cleanupText(text: string): string {
    const replacements: Record<string, string> = {
      "=C3=A9": "é",
      "=C3=A8": "è",
      "=C3=A0": "à",
      "=C3=B4": "ô",
      "=C3=A2": "â",
      "=C3=AA": "ê",
      "=C3=AB": "ë",
      "=C3=AF": "ï",
      "=C3=AE": "î",
      "=C3=A7": "ç",
      "=C3=80": "À",
      "=C3=89": "É",
      "=C3=8A": "Ê",
      "=C3=8B": "Ë",
      "=C3=8C": "Ì",
      "=C3=8D": "Í",
      "=3D": "=",
    };
    let cleaned = text.replace(/\s{2,}/g, " ").trim();
    cleaned = cleaned.replace("***Potentiel-SPAM***", "");
    cleaned = Object.keys(replacements).reduce((acc, key) => {
      return acc.replace(new RegExp(key, "g"), replacements[key]);
    }, cleaned);
    cleaned = this.decodeEntities(cleaned);
    return cleaned;
  }
}