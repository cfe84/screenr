import { ISpamTrainingDataset } from "./ISpamTrainingDataset"

export interface ISpamTraining {
  ham: ISpamTrainingDataset,
  spam: ISpamTrainingDataset,
}