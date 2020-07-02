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
  movedTo?: Folder,
  registerResult?: ScreeningResult
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
  "Unknown": ScreeningResult.RequiresManualScreening,
  "Inbox": ScreeningResult.LeaveInInbox,
  "Reference": ScreeningResult.Reference,
  "Rejected": ScreeningResult.Rejected,
  "Newsletter": ScreeningResult.Newsletter
}


describe("Screener", async () => {
  // given

  const folders: IDictionary<string> = {
    Inbox: "Inbox",
    ForScreening: "Inbox.ForScreening",
    Screened: "Inbox.SCREENED",
    Newsletter: "Inbox.Newsletters",
    Reference: "Inbox.Reference",
    Rejected: "Inbox.Rejected"
  }
  const senderScreeningProvider = td.object(["getScreeningResultAsync", "addScreeningGuidelineAsync"])
  const mailbox = td.object(["moveMailAsync", "getMailAsync"])
  const deps = { folders: folders as unknown as IFolders, senderScreeningProvider, mailbox }
  const screener = new Screener(deps)
  const availableFolders = ["Unknown", "Inbox", "Reference", "Rejected", "Newsletter"]

  const createFolderMailList = (folderName: string) =>
    availableFolders
      .map(result => {
        td.when(senderScreeningProvider.getScreeningResultAsync(createMailSender(folderName, result))).thenResolve(results[result])
        return createMail(createMailId(folderName, result), createMailSender(folderName, result))
      })

  const buildExpectedResultForFolder = (folder: string, correspondingRegistration: ScreeningResult) =>
    ({
      name: folder,
      behaviors: availableFolders.map(result => ({
        result,
        moved: false,
        registerResult: result === folder ? undefined : correspondingRegistration
      }))
    })

  const expectedResults: ExpectedResult[] = [
    {
      name: "Inbox",
      behaviors: [
        { result: "Inbox", moved: false },
        { result: "Unknown", movedTo: folders.ForScreening },
        { result: "Reference", movedTo: folders.Reference },
        { result: "Rejected", movedTo: folders.Rejected },
        { result: "Newsletter", movedTo: folders.Newsletter },
      ]
    },
    buildExpectedResultForFolder("Newsletter", ScreeningResult.Newsletter),
    buildExpectedResultForFolder("Rejected", ScreeningResult.Rejected),
    buildExpectedResultForFolder("Reference", ScreeningResult.Reference),
    {
      name: "Screened",
      behaviors: [
        { result: "Inbox", movedTo: folders.Inbox },
        { result: "Unknown", movedTo: folders.Inbox },
        { result: "Reference", movedTo: folders.Inbox },
        { result: "Rejected", movedTo: folders.Inbox },
        { result: "Newsletter", movedTo: folders.Inbox },
      ]
    },
  ]

  expectedResults.forEach(result => {
    const folder = folders[result.name] as Folder
    td.when(mailbox.getMailAsync(folder)).thenResolve(createFolderMailList(result.name))
  })

  await screener.ScreenMailAsync()

  expectedResults.forEach(folder => {
    context(folder.name, () => {
      folder.behaviors.forEach(behavior => {
        const mailId = createMailId(folder.name, behavior.result)
        const mailSender = createMailSender(folder.name, behavior.result)
        if (behavior.moved === false) {
          it(`leaves ${behavior.result} emails unmoved`, () => td.verify(mailbox.moveMailAsync(mailId, folders[folder.name], td.matchers.anything()), { times: 0 }))
        } else {
          it(`moves ${behavior.result} to ${behavior.movedTo}`, () => td.verify(mailbox.moveMailAsync(mailId, folders[folder.name], behavior.movedTo)))
        }
        if (behavior.registerResult !== undefined) {
          it(`registers ${behavior.result} mail to ${behavior.registerResult}`,
            () => td.verify(senderScreeningProvider.addScreeningGuidelineAsync(mailSender, behavior.registerResult)))
        } else {
          it(`leaves ${behavior.result} registration unchanged`,
            () => td.verify(senderScreeningProvider.addScreeningGuidelineAsync(mailSender, td.matchers.anything()), { times: 0 }))
        }
      })
    })
  })

  //context("Mail from sender newly registered to another folder")
})
