import * as should from "should"

import { email, text } from "./data/email-1";
import { ImapTools } from "../src/infrastructure/ImapTools"

describe("Imap tools", () => {
  it("maps From: =?ISO-8859-1?Q?Charles_F=E9val?= <my@mail.com>\r\n\r\n", () => {
    // given
    const response = {
      '#': 1,
      uid: 3,
      'body[header.fields (from)]': 'From: =?ISO-8859-1?Q?Charles_F=E9val?= <my@mail.com>\r\n\r\n'
    }

    // when
    const mail = ImapTools.mapResponseToMail(response)

    // then
    should(mail.mailId).eql("3")
    should(mail.sender).eql("my@mail.com")
  })
  it("maps From: From: viadeonews@viadeo.com\r\n\r\n", () => {
    // given
    const response = {
      '#': 1,
      uid: 3,
      'body[header.fields (from)]': "From: my@mail.com\r\n\r\n"
    }

    // when
    const mail = ImapTools.mapResponseToMail(response)

    // then
    should(mail.mailId).eql("3")
    should(mail.sender).eql("my@mail.com")
  })

  it("parses body", async () => {
    // given
    const response = {
      "body[]": email,
      "uid": "3",
    };

    // when
    const mailContent = await ImapTools.mapResponseToMailContentAsync(response);

    // then
    should(mailContent.mailId).eql("3");
    should(mailContent.subject).eql("Le numéro 1 des couteaux de cuisine dans le monde");
    should(mailContent.content).eql(text);
  })
})