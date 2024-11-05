Screenr is workflow instrumentation for your email. It works using several folders, and sorts your email based on the sender's email address.

Emails received from a new sender is removed from your inbox and placed into a `For screening` folder. Your job is to screen those senders occasionally, and determine what to do with these:
- Move the mail from senders you want to allow in your inbox into the `Screened` folder. Screenr will then move these back into the `Inbox` folder, and from now on just let them land into the inbox safely.
- Create folders for sorting your email according to your workflow. A recommended workflow is:
  - Move the mail you care  about (newsletters, corporate communications, ...) into the `Newsletter` folder.
  - Move the mail you need to keep for reference (order confirmation, receipts, tickets) into the `Reference` folder.
  - Move the mail you don't want into the `Rejected` folder.

Screenr learns from you, and will direct all future mail based on how you've screened senders into the right folder.

You can change your mind later by just moving a mail from someone into another folder.

Screenr also includes a built-in spam filter.

## How it works

It connects to an IMAP server using your credentials, and screens your mail several times a minute. It saves what it learns into a local file.

For each folder you specify:
1. A target folder (e.g. `Reference`)
2. A screening folder (e.g. `Classify in Reference`)

You can use a shortcut and specify the screening folder to be directly the target folder. The advantage of doing so is simplicity. The downside is that it will forbid you from classifying a random email into a given folder without re-directing all of the sender's mail directly there. For `Reference` mail, for example, it's probably a good idea to keep the _target_ and the _screening_ folder distinct, so you can move some of your usual contact's mail that you normally want in your _inbox_ back into your _reference_ folder.

### Spam detection

Spam detection works by comparing incoming emails from unknown senders to known ham (good emails) and spam. Screenr doesn't come with any pre-training, and fully uses the spam and ham _you_ receive to make a call on whether that email is a spam. That technique works relatively well, and achieves empirical success > 95%. It's especially good when you receive the same type of spam often, and it will never categorize an email from a sender you screened as junk. 

## Running it

You mainly have two options:
- Using node: install node js, then install Screenr using command `npm install -g screenr`, then run command `screenr` in the folder containing your configuration file.
- Using docker, see [this blog post](https://feval.ca/posts/screenr).

## Configuration

Copy the `config.template.json` onto a `config.json` file and set the values you want. You can specify where the config file is using the `SCREENR_CONFIG_FILE` environment variable to its full path, else Screenr will look for it in the current working directory.

You can specify as many folders as you want. If you want to use the _target_ folder as the _screening_ folder, then just give the folder path as a string. E.g.:

```json
"Newsletter": "INBOX.Newsletter"
```

If you want to use distinct folders, use an object:

```json
"Reference" : { "folder": "INBOX.Reference", "screeningFolder": "INBOX.FileIn.Reference" }
```

Screenr supports two email client connectors for now: `imap` and `imapSimple`. The only difference is the library it's using for connecting, however I've noticed that imap is slightly faster on my person email (Dotcove) while imapSimple works with the imap head of my work's exchange server. If you have trouble connecting using one, try the other.

To select the client you want to use, only keep this one in the configuration file. 

- `imap.ssl` indicates whether you want to use secured transport layer. Default is false
- `imap.ca` allows you to set a CA root certificate for secured transport layer. Default is null.
- `imap.validateCertificate` and `imapSimple.validateCertificate` indicate if you require a validate certificate. Default is true. This is useful if you have trouble with the local certificate store (e.g. `Error: unable to get local issuer certificate`), however not recommended for obvious security reasons.

### Configure the spam filter

Optionally you can turn on Screenr's spam filter. You do so by adding the following config key:

```json
  "spam": {
    "isSpam": "INBOX.Junk",
    "isHam": "INBOX",
    "recycleBox": "INBOX.SuspectedSpam",
    "trainingFrequencyMinutes": 60,
    "trainingDatasetSizeLimit": 10000
  },
```

- `isSpam` is the folder where you store your spam (This means that you should stop deleting it, so that it can be used for training)
- `isHam` is a folder that can be used as a reference for good emails, such as an archive folder.
- `recycleBox` is when Screenr will put emails it thinks are spam. Once you review these, move them to the spam folder to reinforce the training. You _can_ put your spam folder as the recycle box, but I strongly advise having two separate ones at first to validate it works for you.
- `frequency` is how often the training happens
- `datasetSizeLimit` is how many emails are used for training. The larger the set, the stronger the result, but the more storage and memory it will require.

## Features

- [x] File mails automatically for inbox
  - Use a filing folder (`Screened`). Mails that have been screened are moved back to Inbox.
  - Mails from senders that have already been screened are left in the inbox.
- [x] File mails automatically for newsletter, references and rejected.
  - Senders of mails moved into the newsletter, reference or rejected folders are then automatically categorized as such
- [x] Configure flexible folders
  - Allow adding any folders rather than just the 3 (newsletter, reference and rejected)
  - Support two mechanisms: 
    1. classify mails in the folder (i.e. senders of mails placed in this folder will always be classified there),
    2. use an intermediary `fileTo` folder (i.e. works the same way as the `screened`/`inbox` folders). The goal is to allow refiling a mail into the target folder without categorizing the corresponding sender.
- [x] Add "binary"
- [x] Choose IMAP client
- [~] Display ≈folder list on start (only on imap simple for now)
  - [ ] Validate configured folders
- [x] Allow SSL connection
  - [x] Disable certificate check (NODE_TLS_REJECT_UNAUTHORIZED=0)
