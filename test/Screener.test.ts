import * as td from "testdouble"
import * as should from "should"

import { IFolders, Folder } from "../src/contracts/IFolderProvider"
import { ScreeningResult } from "../src/contracts/ScreeningResult"
import { Screener } from "../src/domain/Screener"
import { MailId, Sender, IMail } from "../src/contracts/IMail"
import { IDictionary } from "../src/contracts/IDictionary"

interface Behavior {
  result: string,
  moved?: boolean,
  movedTo?: Folder
}

interface ExpectedResult {
  name: string,
  behaviors: Behavior[]
}

const createMail = (mailId: MailId, sender: Sender): IMail => ({
  mailId,
  sender
})

const createMailId = (folderName: string, result: string) => `${folderName}_${result}_ID`
const createMailSender = (folderName: string, result: string) => `${folderName}_${result}_SENDER`

const results: { [key: string]: ScreeningResult } = {
  "UNKNOWN": ScreeningResult.RequiresManualScreening,
  "IMPORTANT": ScreeningResult.Important,
  "REFERENCE": ScreeningResult.Reference,
  "REJECTED": ScreeningResult.Rejected,
  "NEWSLETTER": ScreeningResult.Newsletter
}


describe("Screener", async () => {
  // given

  const folders: IDictionary<string> = {
    Inbox: "INBOX",
    ForScreening: "INBOX.ForScreening",
    Screened: "INBOX.SCREENED",
    Newsletter: "INBOX.Newsletters",
    Reference: "INBOX.REFERENCE",
    Rejected: "INBOX.REJECTED"
  }
  const senderScreeningProvider = td.object(["getScreeningResultAsync", "addScreeningGuidelineAsync"])
  const mailbox = td.object(["moveMailAsync", "getMailAsync"])
  const deps = { folders: folders as unknown as IFolders, senderScreeningProvider, mailbox }
  const screener = new Screener(deps)

  const createFolderMailList = (folderName: string) =>
    ["UNKNOWN", "IMPORTANT", "REFERENCE", "REJECTED", "NEWSLETTER"]
      .map(result => {
        td.when(senderScreeningProvider.getScreeningResultAsync(createMailSender(folderName, result))).thenResolve(results[result])
        return createMail(createMailId(folderName, result), createMailSender(folderName, result))
      })


  const expectedResults: ExpectedResult[] = [
    {
      name: "Inbox",
      behaviors: [
        { result: "IMPORTANT", moved: false },
        { result: "UNKNOWN", movedTo: folders.ForScreening },
        { result: "REFERENCE", movedTo: folders.Reference },
        { result: "REJECTED", movedTo: folders.Rejected },
        { result: "NEWSLETTER", movedTo: folders.Newsletter },
      ]
    }
  ]

  expectedResults.forEach(result => {
    const folder = folders[result.name] as Folder
    td.when(mailbox.getMailAsync(folder)).thenResolve(createFolderMailList(result.name))

  })

  await screener.ScreenMailAsync()

  expectedResults.forEach(folder => {
    context(folder.name, () => {
      folder.behaviors.forEach(behavior => {
        if (behavior.moved === false) {
          it(`leaves ${behavior.result} emails unmoved`, () => td.verify(deps.mailbox.moveMailAsync(createMailId(folder.name, behavior.result), folders[folder.name], td.matchers.anything()), { times: 0 }))
        } else {
          it(`moves ${behavior.result} to ${behavior.movedTo}`, () => td.verify(deps.mailbox.moveMailAsync(createMailId(folder.name, behavior.result), folders[folder.name], behavior.movedTo)))
        }
      })
    })
  })

  // context("Inbox", () => {
  //   it("leaves important emails around", () => td.verify(deps.mailbox.moveMailAsync(createMailId("INBOX", "IMPORTANT"), folders.Inbox, td.matchers.anything()), { times: 0 }))
  //   it("moves unknown to screening", () => td.verify(deps.mailbox.moveMailAsync(createMailId("INBOX", "UNKNOWN"), folders.Inbox, folders.ForScreening)))
  // })

})
