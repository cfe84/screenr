import * as should from "should"

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
})