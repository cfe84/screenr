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