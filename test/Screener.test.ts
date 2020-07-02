import * as td from "testdouble"
import * as should from "should"

import { IFolders, Folder } from "../src/contracts/IFolderProvider"
import { ScreeningResult } from "../src/contracts/ScreeningResult"
import { Screener } from "../src/domain/Screener"
import { MailId, Sender, IMail } from "../src/contracts/IMail"
import { IDictionary } from "../src/contracts/IDictionary"
import { ISenderScreeningResultProvider } from "../src/contracts/ISenderScreeningResultProvider"

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

class MemorySenderScreeningProvider implements ISenderScreeningResultProvider {
  memory: IDictionary<ScreeningResult> = {}
  getScreeningResultAsync = async (sender: string): Promise<ScreeningResult> => {
    return this.memory[sender]
  }
  addScreeningGuidelineAsync = async (sender: string, guideline: ScreeningResult): Promise<void> => {
    this.memory[sender] = guideline
  }

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
  const senderScreeningProvider = new MemorySenderScreeningProvider()
  const mailbox = td.object(["moveMailAsync", "getMailAsync"])
  const deps = { folders: folders as unknown as IFolders, senderScreeningProvider, mailbox }
  const screener = new Screener(deps)
  const availableFolders = ["Unknown", "Inbox", "Reference", "Rejected", "Newsletter"]

  const createFolderMailList = (folderName: string) =>
    availableFolders
      .map(result => {
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
        { result: "Unknown", movedTo: folders.Inbox, registerResult: ScreeningResult.LeaveInInbox },
        { result: "Reference", movedTo: folders.Inbox, registerResult: ScreeningResult.LeaveInInbox },
        { result: "Rejected", movedTo: folders.Inbox, registerResult: ScreeningResult.LeaveInInbox },
        { result: "Newsletter", movedTo: folders.Inbox, registerResult: ScreeningResult.LeaveInInbox },
      ]
    },
  ]

  const mail: IDictionary<IMail[]> = {}
  expectedResults.forEach(result => mail[result.name] = createFolderMailList(result.name))

  /// Check moving between folders
  const createMovedBetweenCats_and_returnExpectedBehavior = (oldFolder: string, newFolder: string, originalRegistration: ScreeningResult) => {
    const sender = `MOVED_FROM_${oldFolder}_TO_${newFolder}`
    const expectedToMoveMailId = `${sender}_STILL_IN_${oldFolder}`
    mail[oldFolder].push(createMail(expectedToMoveMailId, sender))
    mail[newFolder].push(createMail(`${sender}_NOW_IN_${newFolder}`, sender))
    senderScreeningProvider.addScreeningGuidelineAsync(sender, originalRegistration)
    const expectedBehavior = () => td.verify(mailbox.moveMailAsync(expectedToMoveMailId, folders[oldFolder], folders[newFolder]))
    return expectedBehavior
  }

  const checkSenderMovedFromRefToNewsletter = createMovedBetweenCats_and_returnExpectedBehavior("Reference", "Newsletter", ScreeningResult.Reference)
  const checkSenderMovedFromNewsletterToRef = createMovedBetweenCats_and_returnExpectedBehavior("Newsletter", "Reference", ScreeningResult.Newsletter)
  const checkSenderMovedFromRejectedToNewsletter = createMovedBetweenCats_and_returnExpectedBehavior("Rejected", "Newsletter", ScreeningResult.Rejected)
  const checkSenderMovedFromInboxToRejected = createMovedBetweenCats_and_returnExpectedBehavior("Inbox", "Rejected", ScreeningResult.LeaveInInbox)
  /// End check

  await Promise.all(expectedResults.map(async result => {
    const folder = folders[result.name] as Folder
    td.when(mailbox.getMailAsync(folder)).thenResolve(mail[result.name])
    await Promise.all(availableFolders.map(folder => senderScreeningProvider.addScreeningGuidelineAsync(createMailSender(result.name, folder), results[folder])))
  }))

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
          it(`registers ${behavior.result} mail to ${behavior.registerResult}`, async () =>
            should(await senderScreeningProvider.getScreeningResultAsync(mailSender)).eql(behavior.registerResult))
        }
      })
    })
  })

  context("Mail from sender newly registered to another folder", () => {
    it("Moves mails from newsletter to reference", checkSenderMovedFromNewsletterToRef)
    it("Moves mails from reference to newsletter", checkSenderMovedFromRefToNewsletter)
    it("Moves mails from inbox to rejected", checkSenderMovedFromInboxToRejected)
    it("Moves mails from rejected to newsletter", checkSenderMovedFromRejectedToNewsletter)
  })
})
