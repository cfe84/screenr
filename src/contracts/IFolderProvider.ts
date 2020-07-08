import { IFolders } from "./IFolders"


export interface IFolderProvider {
    getFoldersAsync(): Promise<IFolders>
}