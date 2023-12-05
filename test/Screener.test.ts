import * as td from "testdouble"
import * as should from "should"

import { ScreeningResult, ScreeningResultType } from "../src/contracts/ScreeningResult"
import { Screener } from "../src/domain/Screener"
import { MailId, Sender, IMail } from "../src/contracts/IMail"
import { IDictionary } from "../src/contracts/IDictionary"
import { ISenderScreeningResultProvider } from "../src/contracts/ISenderScreeningResultProvider"
import { Folder } from "../src/contracts/Folder"
import { IFolders } from "../src/contracts/IFolders"
import { IMailbox } from "../src/contracts/IMailbox"

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
  "Unknown": { result: ScreeningResultType.RequiresManualScreening },
  "Inbox": { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Inbox" },
  "Reference": { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Reference" },
  "Rejected": { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Rejected" },
  "Newsletter": { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Newsletter" },
}


describe("Screener", async () => {
  // given
  const folderPaths: IDictionary<Folder> = {
    Inbox: "Inbox",
    Screened: "Inbox.Screened",
    ForScreening: "Inbox.ForScreening",
    Newsletter: "Inbox.Newsletters",
    Reference: "Inbox.Reference",
    Rejected: "Inbox.Rejected"
  }

  const folders: IFolders = {
    aliases: ["Inbox", "Reference", "Rejected", "Newsletter", "ForScreening"],
    folders: {
      Inbox: { folder: folderPaths.Inbox, screeningFolder: folderPaths.Screened },
      ForScreening: { folder: folderPaths.ForScreening, screeningFolder: folderPaths.ForScreening },
      Newsletter: { folder: folderPaths.Newsletter, screeningFolder: folderPaths.Newsletter },
      Reference: { folder: folderPaths.Reference, screeningFolder: folderPaths.Reference },
      Rejected: { folder: folderPaths.Rejected, screeningFolder: folderPaths.Rejected }
    }
  }

  const senderScreeningProvider = new MemorySenderScreeningProvider()
  const mailbox = td.object<IMailbox>()
  const log = td.object(["log", "warn", "error"])
  const deps = { folders: folders as unknown as IFolders, senderScreeningProvider, mailbox, log }
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
        { result: "Unknown", movedTo: "ForScreening" },
        { result: "Reference", movedTo: "Reference" },
        { result: "Rejected", movedTo: "Rejected" },
        { result: "Newsletter", movedTo: "Newsletter" },
      ]
    },
    buildExpectedResultForFolder("Newsletter", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Newsletter" }),
    buildExpectedResultForFolder("Rejected", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Rejected" }),
    buildExpectedResultForFolder("Reference", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Reference" }),
    {
      name: "Screened",
      behaviors: [
        { result: "Inbox", movedTo: "Inbox" },
        { result: "Unknown", movedTo: "Inbox", registerResult: { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Inbox" } },
        { result: "Reference", movedTo: "Inbox", registerResult: { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Inbox" } },
        { result: "Rejected", movedTo: "Inbox", registerResult: { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Inbox" } },
        { result: "Newsletter", movedTo: "Inbox", registerResult: { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Inbox" } },
      ]
    },
    {
      name: "ForScreening",
      behaviors: [
        { result: "Inbox", movedTo: "Inbox" },
        { result: "Unknown", moved: false },
        { result: "Reference", movedTo: "Reference" },
        { result: "Rejected", movedTo: "Rejected" },
        { result: "Newsletter", movedTo: "Newsletter" },
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
    const expectedBehavior = () => td.verify(
      mailbox.moveMailAsync(expectedToMoveMailId,
        folders.folders[oldFolder].folder,
        folders.folders[newFolder].folder))
    return expectedBehavior
  }

  const checkSenderMovedFromRefToNewsletter = createMovedBetweenCats_and_returnExpectedBehavior("Reference", "Newsletter", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Reference" })
  const checkSenderMovedFromNewsletterToRef = createMovedBetweenCats_and_returnExpectedBehavior("Newsletter", "Reference", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Newsletter" })
  const checkSenderMovedFromRejectedToNewsletter = createMovedBetweenCats_and_returnExpectedBehavior("Rejected", "Newsletter", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Rejected" })
  const checkSenderMovedFromInboxToRejected = createMovedBetweenCats_and_returnExpectedBehavior("Inbox", "Rejected", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Inbox" })
  const checkSenderMovedFromForScreeningToRejected = createMovedBetweenCats_and_returnExpectedBehavior("ForScreening", "Rejected", { result: ScreeningResultType.RequiresManualScreening })
  /// End check

  /// Check rejecting message move doesn't break the whole flow.
  createMovedBetweenCats_and_returnExpectedBehavior("Rejected", "Reference", { result: ScreeningResultType.TargetFolder, targetFolderAlias: "Rejected" })
  td.when(mailbox.moveMailAsync(
    `MOVED_FROM_Rejected_TO_Reference_STILL_IN_Rejected`, folderPaths["Rejected"], folderPaths["Reference"])).thenReject(Error("MOVE_ERROR"))

  await Promise.all(expectedResults.map(async result => {
    const folder = folderPaths[result.name] as Folder
    td.when(mailbox.getMailAsync(folder)).thenResolve(mail[result.name])
    await Promise.all(availableFolders.map(folder => senderScreeningProvider.addScreeningGuidelineAsync(createMailSender(result.name, folder), results[folder])))
  }))

  await screener.ScreenMailAsync()

  it("connects and disconnects", () => {
    td.verify(mailbox.connectAsync())
    td.verify(mailbox.disconnectAsync())
  })

  expectedResults.forEach(folder => {
    context(folder.name, () => {
      folder.behaviors.forEach(behavior => {
        const mailId = createMailId(folder.name, behavior.result)
        const mailSender = createMailSender(folder.name, behavior.result)
        if (behavior.moved === false) {
          it(`leaves ${behavior.result} emails unmoved`, () => td.verify(mailbox.moveMailAsync(mailId, folderPaths[folder.name], td.matchers.anything()), { times: 0 }))
        } else {
          it(`moves ${behavior.result} to ${folderPaths[behavior.movedTo || ""]}`,
            () => td.verify(mailbox.moveMailAsync(mailId, folderPaths[folder.name], folderPaths[behavior.movedTo || ""])))
        }
        if (behavior.registerResult !== undefined) {
          it(`registers ${behavior.result} mail to ${behavior.registerResult.targetFolderAlias}`, async () =>
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
    it("Moves mails from for screening to rejected", checkSenderMovedFromForScreeningToRejected)
  })

  context("Resilience", () => {
    it("Logged an issue when moving", () => td.verify(log.error(td.matchers.contains("MOVE_ERROR"))))
  })
})
