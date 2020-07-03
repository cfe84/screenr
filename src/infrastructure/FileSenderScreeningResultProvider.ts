import * as fs from "fs"
import { ISenderScreeningResultProvider } from "../contracts/ISenderScreeningResultProvider";
import { ScreeningResult } from "../contracts/ScreeningResult";
import { IDictionary } from "../contracts/IDictionary";

export class FileSenderScreeningResultProvider implements ISenderScreeningResultProvider {
  memory: IDictionary<ScreeningResult> = {}

  private loadMemory = () => {
    if (fs.existsSync(this.filePath)) {
      const content = fs.readFileSync(this.filePath).toString()
      this.memory = JSON.parse(content)
    }
  }

  private saveMemory = () => {
    const content = JSON.stringify(this.memory)
    fs.writeFileSync(this.filePath, content)
  }

  constructor(private filePath: string) {
    this.loadMemory()
  }

  getScreeningResultAsync(sender: string): Promise<import("../contracts/ScreeningResult").ScreeningResult> {
    return Promise.resolve(this.memory[sender])
  }
  addScreeningGuidelineAsync(sender: string, guideline: ScreeningResult): Promise<void> {
    this.memory[sender] = guideline
    this.saveMemory()
    return Promise.resolve()
  }
}