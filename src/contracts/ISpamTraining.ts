export interface ISpamTraining {
  ham: Record<string, number>
  spam: Record<string, number>
}