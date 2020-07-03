declare module 'emailjs-imap-client' {
  export enum ImapClientLogLevel {
    LOG_LEVEL_NONE = 1000,
    LOG_LEVEL_ERROR = 40,
    LOG_LEVEL_WARN = 30,
    LOG_LEVEL_INFO = 20,
    LOG_LEVEL_DEBUG = 10,
    LOG_LEVEL_ALL = 0
  }

  export interface ImapClientOptions {
    auth?: {
      user: string,
      pass: string
    },
    logLevel?: ImapClientLogLevel,
    id?: { name: string, version: string }
    ignoreTLS?: boolean,
    requireTLS?: boolean,
    useSecureTransport?: boolean,
    enableCompression?: boolean
  }

  export interface CommandOption {
    byUid: boolean
  }

  export default class ImapClient {
    constructor(host: string, port: number, options?: ImapClientOptions)
    onerror: (error: Error) => void
    connect: () => Promise<void>
    close: () => Promise<void>
    moveMessages: (fromFolder: string, mailId: string, toFolder: string, options?: CommandOption) => Promise<void>
  }
}
