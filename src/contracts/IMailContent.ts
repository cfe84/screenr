import { MailId } from "./IMail"

export type Subject = string
export type Body = string

export interface IMailContent {
  mailId: MailId
  subject: Subject
  content: Body
}