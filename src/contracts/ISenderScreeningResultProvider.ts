import { Sender } from "./IMail";
import { ScreeningResult } from "./ScreeningResult";

export interface ISenderScreeningResultProvider {
    getScreeningResultAsync(sender: Sender): Promise<ScreeningResult>
    addScreeningGuidelineAsync(sender: Sender, guideline: ScreeningResult): Promise<void>
}