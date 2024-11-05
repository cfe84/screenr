import removeAccents from "remove-accents";
import LanguageDetect = require("languagedetect");
import {stemmer} from "porter-stemmer";
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
const languageDetector = new LanguageDetect();
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

		// We train negative on spam, and positive on ham.
		// The result of training is a list of weighted chains of tokens that positively indicate a spam/ham (see getScore)
    this.spamTraining.spam = await this.trainOnMailboxAsync([this.spamFolder]);
    this.spamTraining.ham = await this.trainOnMailboxAsync([this.referenceFolder]);
    await this.deps.spamTrainingProvider.saveTrainingAsync(this.spamTraining);

    await this.deps.mailbox.disconnectAsync()
    this.deps.log.log(`Done training spam detector. Spam: ${Object.keys(this.spamTraining.spam.map).length} tokens, Ham: ${Object.keys(this.spamTraining.ham.map).length} tokens`);
  }

	// Check a list of mailboxes for spam, returns a list of emails associated with a isSpam flag.
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
		// We always consider empty emails to be suspicious. 
    if (tokens.length === 0) {
      return true;
    }
		// Similarly to training, we look for the score underlining a ham
		// and compare to the score of an email that is a spam. If it looks
		// more like a spam than a ham, then we assume it's a spam
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

	// Returns a score between 0 and 1 that indicates similarity to the training dataset.
  private async getScore(tokens: string[], trainingDataset: ISpamTrainingDataset): Promise<number> {
    let score = 0;
    // Total achievable tokenCount is the sum of all token chain lengths from min to max
    let tokenCount = tokens.length * (TOKEN_CHAIN_LENGTH.max * (TOKEN_CHAIN_LENGTH.max + 1) - TOKEN_CHAIN_LENGTH.min * (TOKEN_CHAIN_LENGTH.min - 1)) / 2;
		// We are looking at chains of tokens, not simply tokens. If the email is shorter
		// than the length of the token chain we use for inspection, then we cannot
		// calculate a score, and return 0.
    if (tokens.length < TOKEN_CHAIN_LENGTH.min) {
      return 0;
    }
    for (let tokenChainLength = TOKEN_CHAIN_LENGTH.min; tokenChainLength <= TOKEN_CHAIN_LENGTH.max; tokenChainLength++) {
      for (let i = 0; i < tokens.length - tokenChainLength + 1; i++) {
				// Token chains are indexed with the chain joined by a space 
        const tokenChain = tokens.slice(i, i + tokenChainLength).join(" ");
				// If chain is not found, we don't increase the score.
        const count = trainingDataset.map[tokenChain] || 0;
        if (count > 0) {
				  // When the token matches, we count the length of the token chain.
          score += tokenChainLength;
        } else {
          tokenCount -= tokenChainLength;
        }
      }
    }
		// If tokenCount is null, this means that not a single chain matched
		// then training set we looked for, so we return a score of 0.
    if (tokenCount === 0) {
      return 0;
    }
		// The result is the %-age of tokens that matched the training dataset.
    return score / tokenCount / trainingDataset.trainingDatasetSize;
  }

  private async trainOnMailboxAsync(mailboxes: string[]): Promise<ISpamTrainingDataset> {
    this.deps.log.log(`trainOnMailboxAsync: Start training on ${mailboxes.join(", ")}`)
    const map: Record<string, number> = {};
    let trainingDatasetSize = 0;
    for(let mailbox of mailboxes) {
      const mails = await this.deps.mailbox.getMailAsync(mailbox);
      // Go from newest to oldest
      for (let i = mails.length - 1; i > 0; i -= chunkSize) {
        const start = Math.max(0, i - chunkSize);
        this.deps.log.log(`trainOnMailboxAsync: Training on ${mailbox} messages ${start} to ${i} of ${mails.length}`)
        const chunk = mails.slice(start, i);
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
          this.deps.log.warn(`trainOnMailboxAsync: Training dataset size limit reached: ${trainingDatasetSize}`)
          break;
        }
      }
    }
    this.deps.log.log(`trainOnMailboxAsync: Finished training on ${mailboxes.join(", ")}`)
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
    const languages = languageDetector.detect(text);
    const isFrench = languages.some(language => language[0] === "french" && language[1] > .3);
    const isGerman = languages.some(language => language[0] === "german" && language[1] > .3);
    return removeAccents(text)
			// We don't look for a specific URL, but just that there was one.
      .replace(/(https?:\/\/[^\s]+)/g, ` ${URL_TOKEN} `)
			// We replace all non-alpha characters by a single dot.
      .replace(/([^a-zA-Z\s]+)/g, ` . `)
      .split(/\s+/)
      .map(token => token === URL_TOKEN ? URL_TOKEN : token.toLowerCase())
      .map(token => token === URL_TOKEN ? URL_TOKEN 
        : token === "." ? NON_ALPHA_CHARACTER 
				// We don't want to be over-influenced by single chars.
        : token.length === 1 ? SINGLE_CHARACTER 
				// We use a simple porter-stemmer. While it's tuned for english, it's
				// reasonably working for other languages like french or german in which
				// I receive spam.
        : stemmer(token))
      .filter(token => !IGNORE_TOKENS.includes(token))
      ;
  }
}
