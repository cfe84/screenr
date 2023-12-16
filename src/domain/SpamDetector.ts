import * as removeAccents from "remove-accents";
import * as cld from "cld";
import { Stemmer, Languages } from "multilingual-stemmer";
import { IMailbox } from "../contracts/IMailbox";
import { IMailContent } from "../contracts/IMailContent";
import { ILogger } from "../contracts/ILogger";
import { ISpamTrainingStore } from "../contracts/ISpamTrainingStore";
import { ISpamTraining } from "../contracts/ISpamTraining";
import { ISpamTrainingDataset } from "../contracts/ISpamTrainingDataset";

const chunkSize = 25;
const SINGLE_CHARACTER = "SINGLE_CHAR";
const NON_ALPHA_CHARACTER = "NON_ALPHA";
const URL_TOKEN = "URLTOKEN";
const IGNORE_TOKENS = ["", SINGLE_CHARACTER, NON_ALPHA_CHARACTER];

const TOKEN_CHAIN_LENGTH = { min: 2, max: 4 }

export interface SpamDetectorDeps {
  mailbox: IMailbox
  log: ILogger
  spamTrainingProvider: ISpamTrainingStore
}

export class SpamDetector {
  static async CreateAsync(deps: SpamDetectorDeps, referenceFolder: string, spamFolder: string, trainingDatasetSizeLimit?: number): Promise<SpamDetector> {
    const spamTraining = await deps.spamTrainingProvider.getTrainingAsync();
    return new SpamDetector(deps, spamTraining, referenceFolder, spamFolder, trainingDatasetSizeLimit);
  }

  private constructor(private deps: SpamDetectorDeps, private spamTraining: ISpamTraining, private referenceFolder: string, private spamFolder: string, private trainingDatasetSizeLimit?: number) { }

  async TrainAsync() {
    this.deps.log.log(`Start training spam detector`)
    await this.deps.mailbox.connectAsync();

    this.spamTraining.spam = await this.trainOnMailboxAsync([this.spamFolder]);
    this.spamTraining.ham = await this.trainOnMailboxAsync([this.referenceFolder]);
    await this.deps.spamTrainingProvider.saveTrainingAsync(this.spamTraining);

    await this.deps.mailbox.disconnectAsync()
    this.deps.log.log(`Done training spam detector. Spam: ${Object.keys(this.spamTraining.spam.map).length} tokens, Ham: ${Object.keys(this.spamTraining.ham.map).length} tokens`);
  }

  private async checkMailboxAsync(mailboxes: string[]){
    const map: Record<string, number> = {};
    const res = [];
    for(let mailbox of mailboxes) {
      const mails = await this.deps.mailbox.getMailAsync(mailbox);
      for (let i = 0; i < mails.length; i += chunkSize) {
        this.deps.log.log(`Processing ${mailbox} messages ${i} to ${i + chunkSize} of ${mails.length}`)
        const chunk = mails.slice(i, i + chunkSize);
        try {
          const mailContents = await this.deps.mailbox.getMailContentAsync(mailbox, chunk.map(mail => mail.mailId));
          for (let j = 0; j < mailContents.length; j++) {
            const mailContent = mailContents[j];
            const isSpam = await this.detectSpamAsync(mailContent);
            res.push({subject: mailContent.subject, isSpam})
          }
        } catch (error) {
          this.deps.log.error(`${error}`);
        }
      }
    }
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
    return this.getScore(tokens, this.spamTraining.spam);
  }

  private async getHamScore(tokens: string[]): Promise<number> {
    return this.getScore(tokens, this.spamTraining.ham);
  }

  private async getScore(tokens: string[], trainingDataset: ISpamTrainingDataset): Promise<number> {
    let score = 0;
    // Total achievable tokenCount is the sum of all token chain lengths from min to max
    let tokenCount = tokens.length * (TOKEN_CHAIN_LENGTH.max * (TOKEN_CHAIN_LENGTH.max + 1) - TOKEN_CHAIN_LENGTH.min * (TOKEN_CHAIN_LENGTH.min - 1)) / 2;
    if (tokens.length < TOKEN_CHAIN_LENGTH.min) {
      return 0;
    }
    for (let tokenChainLength = TOKEN_CHAIN_LENGTH.min; tokenChainLength <= TOKEN_CHAIN_LENGTH.max; tokenChainLength++) {
      for (let i = 0; i < tokens.length - tokenChainLength + 1; i++) {
        const tokenChain = tokens.slice(i, i + tokenChainLength).join(" ");
        const count = trainingDataset.map[tokenChain] || 0;
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
    return score / tokenCount / trainingDataset.trainingDatasetSize;
  }

  private async trainOnMailboxAsync(mailboxes: string[]): Promise<ISpamTrainingDataset> {
    const map: Record<string, number> = {};
    let trainingDatasetSize = 0;
    for(let mailbox of mailboxes) {
      const mails = await this.deps.mailbox.getMailAsync(mailbox);
      for (let i = 0; i < mails.length; i += chunkSize) {
        this.deps.log.log(`Training on ${mailbox} messages ${i} to ${i + chunkSize} of ${mails.length}`)
        const chunk = mails.slice(i, i + chunkSize);
        try {
          const mailContents = await this.deps.mailbox.getMailContentAsync(mailbox, chunk.map(mail => mail.mailId));
          for (let j = 0; j < mailContents.length; j++) {
            const mailContent = mailContents[j];
            await this.trainOnMessage(mailContent, map);
          }
          trainingDatasetSize += mailContents.length;
        } catch (error) {
          this.deps.log.error(`${error}`);
        }
        if (this.trainingDatasetSizeLimit && trainingDatasetSize >= this.trainingDatasetSizeLimit) {
          this.deps.log.warn(`Training dataset size limit reached: ${trainingDatasetSize}`)
          break;
        }
      }
    }
    return {map, trainingDatasetSize};
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
      .replace(/(https?:\/\/[^\s]+)/g, ` ${URL_TOKEN} `)
      .replace(/([^a-zA-Z\s]+)/g, ` . `)
      .split(/\s+/)
      .map(token => token === URL_TOKEN ? URL_TOKEN : token.toLowerCase())
      .map(token => token === URL_TOKEN ? URL_TOKEN 
        : token === "." ? NON_ALPHA_CHARACTER 
        : token.length === 1 ? SINGLE_CHARACTER 
        : stemmer.stem(token))
      .filter(token => !IGNORE_TOKENS.includes(token))
      ;
  }
}