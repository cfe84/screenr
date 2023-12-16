import * as fs from "fs";
import { ISpamTraining } from "../contracts/ISpamTraining";
import { ISpamTrainingStore } from "../contracts/ISpamTrainingStore";

export class FileSpamTrainingStore implements ISpamTrainingStore {
  constructor(private filePath: string) { }

  async getTrainingAsync(): Promise<ISpamTraining> {
    if (!fs.existsSync(this.filePath)) {
      return {
        ham: {
          map: {},
          trainingDatasetSize: 0,
        },
        spam: {
          map: {},
          trainingDatasetSize: 0,
        },
      }
    }
    const content = fs.readFileSync(this.filePath).toString();
    return JSON.parse(content);
  }
  
  async saveTrainingAsync(training: ISpamTraining): Promise<void> {
    const content = JSON.stringify(training);
    fs.writeFileSync(this.filePath, content);
  }
}