export type Folder = string

export interface IFolders {
    Inbox: Folder
    ForScreening: Folder
    Screened: Folder
    Rejected: Folder
    Newsletter: Folder
    Reference: Folder
}

export interface IFolderProvider {
    getFoldersAsync(): Promise<IFolders>
}