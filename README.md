Screenr is workflow instrumentation for your email. It works using several folders, and sorts your email based on the sender's email address.

Emails received from a new sender is removed from your inbox and placed into a `For screening` folder. Your job is to screen those senders occasionally, and determine what to do with these:
- Move the mail from senders you want in your inbox into the `Screened` folder. Screenr will then move it back into the `Inbox` folder.
- Move the mail you barely care about (newsletters, corporate communications, ...) into the `Newsletter` folder.
- Move the mail you need to keep for reference (order confirmation, receipts, tickets) into the `Reference` folder.
- Move the mail you don't want into the `Rejected` folder.

Screenr learns from you, and will direct all future mail based on how you've screened senders into the right folder.

You can change your mind later by just moving a mail from someone into another folder.

## How it works

It connects to an IMAP server using your credentials, and screens your mail several times a minute. It saves the result onto a local file.

## Configuration

Copy the `config.template.json` onto a `config.json` file.

## Features

- [x] File mails automatically for inbox
  - Use a filing folder (`Screened`). Mails that have been screened are moved back to Inbox.
  - Mails from senders that have already been screened are left in the inbox.
- [x] File mails automatically for newsletter, references and rejected.
  - Senders of mails moved into the newsletter, reference or rejected folders are then automatically categorized as such
- [ ] Configure flexible folders
  - Allow adding any folders rather than just the 3 (newsletter, reference and rejected)
  - Support two mechanisms: 
    1. classify mails in the folder (i.e. senders of mails placed in this folder will always be classified there),
    2. use an intermediary `fileTo` folder (i.e. works the same way as the `screened`/`inbox` folders). The goal is to allow refiling a mail into the target folder without categorizing the corresponding sender.