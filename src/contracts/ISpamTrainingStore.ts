import { ISpamTraining } from "./ISpamTraining";

export interface ISpamTrainingStore {
  getTrainingAsync(): Promise<ISpamTraining>
  saveTrainingAsync(training: ISpamTraining): Promise<void>
}