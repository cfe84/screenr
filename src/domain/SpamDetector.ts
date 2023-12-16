import * as removeAccents from "remove-accents";
import * as cld from "cld";
import { Stemmer, Languages } from "multilingual-stemmer";
import { IMailbox } from "../contracts/IMailbox";
import { IMailContent } from "../contracts/IMailContent";

const chunkSize = 10;
const SINGLE_CHARACTER = "SINGLE_CHAR";
const NON_ALPHA_CHARACTER = "NON_ALPHA";
const IGNORE_TOKENS = ["", SINGLE_CHARACTER, NON_ALPHA_CHARACTER];

const TOKEN_CHAIN_LENGTH = { min: 2, max: 4 }

export class SpamDetector {
private spamMap: Record<string, number> = {};
private hamMap: Record<string, number> = {};

  constructor(private mailbox: IMailbox, private referenceFolder: string, private spamFolder: string) { }

  async TrainAsync() {
    console.warn(`Get spam list`)
    await this.mailbox.connectAsync();

    this.spamMap = await this.trainOnMailboxAsync([this.spamFolder]);
    this.hamMap = await this.trainOnMailboxAsync([this.referenceFolder]);

    await this.checkMailboxAsync([".Newsletter"])

    await this.mailbox.disconnectAsync()
    console.warn(`Done training spam detector`);
  }

  private async checkMailboxAsync(mailboxes: string[]){
    const map: Record<string, number> = {};
    const res = [];
    for(let mailbox of mailboxes) {
      const mails = await this.mailbox.getMailAsync(mailbox);
      for (let i = 0; i < mails.length; i += chunkSize) {
        console.warn(`Processing chunk ${i} to ${i + chunkSize} of ${mails.length}`)
        const chunk = mails.slice(i, i + chunkSize);
        try {
          const mailContents = await this.mailbox.getMailContentAsync(mailbox, chunk.map(mail => mail.mailId));
          for (let j = 0; j < mailContents.length; j++) {
            const mailContent = mailContents[j];
            const isSpam = await this.detectSpamAsync(mailContent);
            res.push({subject: mailContent.subject, isSpam})
          }
        } catch (error) {
          console.error(error);
        }
      }
    }
    console.table(res);
  }

  async detectSpamAsync(mail: IMailContent): Promise<boolean> {
    const tokens = await this.tokenize(mail.subject + " " + mail.content);
    if (tokens.length === 0) {
      return true;
    }
    const spamScore = await this.getSpamScore(tokens);
    const hamScore = await this.getHamScore(tokens);
    return hamScore - spamScore < 0;
  }

  private async getSpamScore(tokens: string[]): Promise<number> {
    return this.getScore(tokens, this.spamMap);
  }

  private async getHamScore(tokens: string[]): Promise<number> {
    return this.getScore(tokens, this.hamMap);
  }

  private async getScore(tokens: string[], map: Record<string, number>): Promise<number> {
    let score = 0;
    // Total achievable tokenCount is the sum of all token chain lengths from min to max
    let tokenCount = tokens.length * (TOKEN_CHAIN_LENGTH.max * (TOKEN_CHAIN_LENGTH.max + 1) - TOKEN_CHAIN_LENGTH.min * (TOKEN_CHAIN_LENGTH.min - 1)) / 2;
    if (tokens.length < TOKEN_CHAIN_LENGTH.min) {
      return 0;
    }
    for (let tokenChainLength = TOKEN_CHAIN_LENGTH.min; tokenChainLength <= TOKEN_CHAIN_LENGTH.max; tokenChainLength++) {
      for (let i = 0; i < tokens.length - tokenChainLength + 1; i++) {
        const tokenChain = tokens.slice(i, i + tokenChainLength).join(" ");
        const count = map[tokenChain] || 0;
        if (count > 0) {
          score += tokenChainLength;
        } else {
          tokenCount -= tokenChainLength;
        }
      }
    }
    if (tokenCount === 0) {
      return 0;
    }
    return score / tokenCount;
  }

  private async trainOnMailboxAsync(mailboxes: string[]): Promise<Record<string, number>> {
      const map: Record<string, number> = {};
      for(let mailbox of mailboxes) {
      const mails = await this.mailbox.getMailAsync(mailbox);
      for (let i = 0; i < mails.length; i += chunkSize) {
        console.warn(`Processing chunk ${i} to ${i + chunkSize} of ${mails.length}`)
        const chunk = mails.slice(i, i + chunkSize);
        try {
          const mailContents = await this.mailbox.getMailContentAsync(mailbox, chunk.map(mail => mail.mailId));
          for (let j = 0; j < mailContents.length; j++) {
            const mailContent = mailContents[j];
            await this.trainOnMessage(mailContent, map);
          }
        } catch (error) {
          console.error(error);
        }
      }
      Object.keys(map).forEach(key => {
        map[key] = map[key] / mails.length;
      });
    }
    return map;
  }

  private async trainOnMessage(mail: IMailContent, map: Record<string, number>) {
    const tokens = await this.tokenize(mail.subject + " " + mail.content);
    if (tokens.length < TOKEN_CHAIN_LENGTH.min) {
      return;
    }
    for (let tokenChainLength = TOKEN_CHAIN_LENGTH.min; tokenChainLength <= TOKEN_CHAIN_LENGTH.max; tokenChainLength++) {
      for (let i = 0; i < tokens.length - tokenChainLength + 1; i++) {
        const tokenChain = tokens.slice(i, i + tokenChainLength).join(" ");
        const count = map[tokenChain] || 0;
        map[tokenChain] = count + tokenChainLength / tokens.length;
      }
    }
  }

  private async tokenize(text: string): Promise<string[]> {
    const languages = await (cld.detect(text));
    const isFrench = languages.languages.some(language => language.code === "fr" && language.percent > 30);
    const isGerman = languages.languages.some(language => language.code === "de" && language.percent > 30);
    const stemmer = isGerman ? new Stemmer(Languages.German) : isFrench ? new Stemmer(Languages.French) : new Stemmer(Languages.English);
    return removeAccents(text)
      .replace(/([^a-zA-Z\s]+)/g, ` . `)
      .split(/\s+/)
      .map(token => token.toLowerCase())
      .map(token => token === "." ? NON_ALPHA_CHARACTER : token.length === 1 ? SINGLE_CHARACTER : stemmer.stem(token))
      .filter(token => !IGNORE_TOKENS.includes(token))
      ;
  }
}